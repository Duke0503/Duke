/**
 * The smallest parts of the HTTP layer: who is calling, and how a request body is read.
 *
 * The error shape those pieces throw lives in `./api-error.ts`; it is re-exported here so a
 * controller only ever imports from one place.
 */

import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { z } from "zod";
import { invalidInput } from "./api-error";

export { badRequest, invalidInput, notFound, refused, unauthenticated } from "./api-error";
export type { ApiErrorBody, Failure, FieldProblem } from "./api-error";

/**
 * The signed-in user's id, resolved by `DeviceUserGuard`.
 *
 * There is no login: the browser sends an anonymous `x-device-id` and the guard turns it
 * into a user row. Every controller that stores anything uses this instead of trusting an id
 * from the body, so one device can never read or write another device's data.
 */
export const UserId = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<{ userId?: string }>();
  if (request.userId === undefined) {
    // A wiring mistake, not a user mistake: the guard is missing from the route.
    throw new Error("UserId() used on a route without DeviceUserGuard.");
  }
  return request.userId;
});

/**
 * Parse a request body with zod, and report every problem at once.
 *
 * Reading `result.error.issues` rather than `result.error.message` matters: the form can
 * point at the field that is wrong instead of showing one sentence about the first failure.
 */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;

  throw invalidInput(
    result.error.issues.map((issue) => ({
      field: issue.path.length > 0 ? issue.path.join(".") : "body",
      problem: issue.message,
    })),
  );
}
