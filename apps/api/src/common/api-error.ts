/**
 * One error shape for the whole API.
 *
 * Every failure the browser can see is this same object, whatever produced it — a zod parse, a
 * domain rule, a missing key, or a bug:
 *
 *   { statusCode, code, message, problems, requestId, path }
 *
 * One shape on purpose. The screens render an error one way (a sentence, plus a red note under
 * each field that is wrong), so a failure from `startCall` and a failure from the request body
 * parser look identical to the UI.
 *
 * Two rules hold this together:
 *
 *   1. **`problems` is never dropped.** It is the field-level detail, and it is the reason the
 *      controller can throw `{ code, problems }` and have it survive all the way to the screen.
 *   2. **Only failures we wrote the words for are shown.** An `AppError` with a known code is
 *      safe to show (its message names the key or the rule). Anything else becomes a plain
 *      "something went wrong on our side" and the stack goes to the log, not the response.
 */

import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { AppError } from "@duke/shared";

export interface FieldProblem {
  readonly field: string;
  readonly problem: string;
}

/** What the browser always receives on a failure. */
export interface ApiErrorBody {
  readonly statusCode: number;
  readonly code: string;
  /** A sentence for a human. Safe to display. */
  readonly message: string;
  readonly problems: readonly FieldProblem[];
  readonly requestId: string;
  readonly path: string;
}

/** The failure, before the request it belonged to is attached. */
export interface Failure {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly problems: readonly FieldProblem[];
}

/** Shown instead of anything internal. */
export const GENERIC_MESSAGE = "Something went wrong on our side. It has been logged.";

/**
 * `AppError` codes that are our own writing, and the status each one deserves.
 *
 * A code that is not here is treated as a bug: the message is hidden, because it came from a
 * provider or from deeper in the stack and might name an internal.
 */
const APP_ERROR_STATUS: Readonly<Record<string, number>> = {
  /** A key is missing or still a placeholder. The app is not configured yet, not broken. */
  ENV_MISSING: HttpStatus.SERVICE_UNAVAILABLE,
};

const DEFAULT_CODES: Readonly<Record<number, string>> = {
  400: "INVALID_INPUT",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "RATE_LIMITED",
  503: "UNAVAILABLE",
};

const defaultCode = (status: number): string =>
  DEFAULT_CODES[status] ?? (status >= 500 ? "INTERNAL" : "REJECTED");

const firstProblem = (problems: readonly FieldProblem[]): string | null => {
  const first = problems[0];
  return first === undefined ? null : first.problem;
};

// ---------------------------------------------------------------- throwing

/**
 * A 400 whose whole story is in `problems`. `message` repeats the first problem, so a log line
 * or a generic toast still says something true.
 */
export const badRequest = (
  code: string,
  problems: readonly FieldProblem[],
): BadRequestException =>
  new BadRequestException({
    code,
    message: firstProblem(problems) ?? "That request could not be understood.",
    problems,
  });

/** A 400 for a body that did not validate. */
export const invalidInput = (problems: readonly FieldProblem[]): BadRequestException =>
  badRequest("INVALID_INPUT", problems);

/** A 404 for something that is not there, or not yours. */
export const notFound = (field: string, problem: string): NotFoundException =>
  new NotFoundException({ code: "NOT_FOUND", message: problem, problems: [{ field, problem }] });

/** A 403 for a rule the request breaks rather than a field. */
export const refused = (code: string, field: string, problem: string): ForbiddenException =>
  new ForbiddenException({ code, message: problem, problems: [{ field, problem }] });

/**
 * A 401 for a request that has not proved it may be here.
 *
 * The code says which kind of "no" this is (`SESSION_REQUIRED`, `SESSION_EXPIRED`,
 * `SESSION_INVALID`) so the log can tell a habit apart from a guess; the sentence is the same
 * kind of sentence for all of them, because the difference is not the visitor's business.
 */
export const unauthenticated = (
  code: string,
  field: string,
  problem: string,
): UnauthorizedException =>
  new UnauthorizedException({ code, message: problem, problems: [{ field, problem }] });

// ---------------------------------------------------------------- reading

const toMessage = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim().length > 0) return value;
  // Nest's own validation pipe answers with an array of sentences.
  if (Array.isArray(value)) {
    const parts = value.filter((item): item is string => typeof item === "string");
    return parts.length === 0 ? null : parts.join(" ");
  }
  return null;
};

const toProblems = (value: unknown): readonly FieldProblem[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const { field, problem } = item as { field?: unknown; problem?: unknown };
    if (typeof problem !== "string") return [];
    return [{ field: typeof field === "string" ? field : "body", problem }];
  });
};

function fromHttpException(exception: HttpException): Failure {
  const status = exception.getStatus();
  const body: unknown = exception.getResponse();

  if (typeof body === "string") {
    return { status, code: defaultCode(status), message: body, problems: [] };
  }

  const record = (body ?? {}) as { code?: unknown; message?: unknown; problems?: unknown };
  return {
    status,
    code: typeof record.code === "string" ? record.code : defaultCode(status),
    message: toMessage(record.message) ?? toMessage(exception.message) ?? defaultCode(status),
    problems: toProblems(record.problems),
  };
}

/** Turn anything that was thrown into the one shape. Never throws. */
export function describeFailure(exception: unknown): Failure {
  if (exception instanceof AppError) {
    const status = APP_ERROR_STATUS[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;
    return {
      status,
      code: exception.code,
      // A known code is our own sentence and is meant to be read ("DATABASE_URL is not set.
      // Add it to your .env file."). An unknown one might name an internal, so it is hidden.
      message: status === HttpStatus.INTERNAL_SERVER_ERROR ? GENERIC_MESSAGE : exception.message,
      problems: [],
    };
  }

  if (exception instanceof HttpException) return fromHttpException(exception);

  return { status: HttpStatus.INTERNAL_SERVER_ERROR, code: "INTERNAL", message: GENERIC_MESSAGE, problems: [] };
}
