import {
  Catch,
  HttpException,
  HttpStatus,
  type ArgumentsHost,
  type ExceptionFilter,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { serializeError, type Logger } from "@duke/shared";

/**
 * The last line of defence: nothing reaches the client without being logged first,
 * with the request id, the route and — for 5xx — the real stack trace.
 *
 * We answer with a small, safe body. Internals never leak to the caller.
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

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const fields = {
      requestId,
      method: request.method,
      url: request.originalUrl,
      statusCode: status,
    };

    if (status >= 500) {
      this.logger.error({ ...fields, err: serializeError(exception) }, "request failed");
    } else {
      this.logger.warn(fields, "request rejected");
    }

    response.status(status).json({
      statusCode: status,
      message: extractMessage(exception),
      requestId,
      path: request.originalUrl,
    });
  }
}

function extractMessage(exception: unknown): string | string[] {
  if (!(exception instanceof HttpException)) return "Internal server error";

  const body = exception.getResponse();
  if (typeof body === "string") return body;

  const message = (body as { message?: unknown }).message;
  if (typeof message === "string") return message;
  if (Array.isArray(message)) return message.map(String);
  return exception.message;
}
