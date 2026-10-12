import { Catch, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { Request, Response } from "express";
import { serializeError, type Logger } from "@duke/shared";
import { describeFailure, type ApiErrorBody } from "../common/api-error";

/**
 * The last line of defence.
 *
 * It does two jobs and they must not be confused with each other:
 *
 *   1. **Log the whole truth.** Every failure is logged with the request id, the route and, for
 *      a 5xx, the real stack trace. This is the record; the response is not.
 *   2. **Answer with a small, safe, predictable body.** `describeFailure` in `../common/api-error`
 *      decides what is safe to show. Anything internal becomes "something went wrong on our
 *      side" and stays in the log.
 *
 * An earlier version flattened every failure to `{ statusCode, message }` and so silently threw
 * away the `problems` array the controllers throw. The screens render one thing per field, so
 * losing it made every form error a single vague sentence. Hence the strict single body shape.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // pino-http sets `id` (string | number | object), so coerce it to a string.
    const rawId: unknown = request.id;
    const requestId = typeof rawId === "string" ? rawId : String(rawId);

    const failure = describeFailure(exception);
    const fields = {
      requestId,
      method: request.method,
      url: request.originalUrl,
      statusCode: failure.status,
      code: failure.code,
    };

    if (failure.status >= 500) {
      this.logger.error({ ...fields, err: serializeError(exception) }, "request failed");
    } else {
      this.logger.warn(fields, "request rejected");
    }

    const body: ApiErrorBody = {
      statusCode: failure.status,
      code: failure.code,
      message: failure.message,
      problems: failure.problems,
      requestId,
      path: request.originalUrl,
    };

    response.status(failure.status).json(body);
  }
}
