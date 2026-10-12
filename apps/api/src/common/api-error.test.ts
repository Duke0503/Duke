import { HttpException, HttpStatus } from "@nestjs/common";
import { AppError } from "@duke/shared";
import { describe, expect, it } from "vitest";
import {
  GENERIC_MESSAGE,
  badRequest,
  invalidInput,
  notFound,
  refused,
  describeFailure,
} from "./api-error";

/**
 * This mapping is what decides what the user is told when something fails, so it gets tests.
 * The two rules under test:
 *
 *   - `problems` always survives, because the screens render one note per field,
 *   - a failure we did NOT write the words for is hidden behind a generic sentence.
 */

describe("describeFailure", () => {
  it("keeps the field problems and promotes the first one to the message", () => {
    const failure = describeFailure(
      invalidInput([
        { field: "name", problem: "Give your friend a name." },
        { field: "role", problem: "Say what this friend is." },
      ]),
    );

    expect(failure.status).toBe(400);
    expect(failure.code).toBe("INVALID_INPUT");
    expect(failure.message).toBe("Give your friend a name.");
    expect(failure.problems).toHaveLength(2);
    expect(failure.problems[1]).toEqual({ field: "role", problem: "Say what this friend is." });
  });

  it("keeps the code a controller chose", () => {
    const failure = describeFailure(
      badRequest("DEVICE_ID_MISSING", [{ field: "x-device-id", problem: "Send an id." }]),
    );

    expect(failure.status).toBe(400);
    expect(failure.code).toBe("DEVICE_ID_MISSING");
    expect(failure.problems).toEqual([{ field: "x-device-id", problem: "Send an id." }]);
  });

  it("answers 404 with the sentence it was given", () => {
    const failure = describeFailure(notFound("id", "No such call."));

    expect(failure.status).toBe(404);
    expect(failure.code).toBe("NOT_FOUND");
    expect(failure.message).toBe("No such call.");
    expect(failure.problems).toEqual([{ field: "id", problem: "No such call." }]);
  });

  it("answers 403 with the rule that was broken", () => {
    const failure = describeFailure(
      refused("BUDGET_EXCEEDED", "usage", "Monthly call minutes are used up."),
    );

    expect(failure.status).toBe(403);
    expect(failure.code).toBe("BUDGET_EXCEEDED");
    expect(failure.message).toBe("Monthly call minutes are used up.");
  });

  it("shows a missing key as 503, because the app is unconfigured rather than broken", () => {
    const failure = describeFailure(
      new AppError("ENV_MISSING", "DATABASE_URL is not set. Add it to your .env file."),
    );

    expect(failure.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(failure.code).toBe("ENV_MISSING");
    // The whole point: the owner is told which key is missing.
    expect(failure.message).toBe("DATABASE_URL is not set. Add it to your .env file.");
  });

  it("hides the message of an AppError code it does not recognise", () => {
    const failure = describeFailure(
      new AppError("WEIRD", "pool at 10.0.0.4 refused, token abc123"),
    );

    expect(failure.status).toBe(500);
    expect(failure.code).toBe("WEIRD");
    expect(failure.message).toBe(GENERIC_MESSAGE);
    expect(failure.message).not.toContain("abc123");
  });

  it("hides a plain thrown Error", () => {
    const failure = describeFailure(new Error("undefined is not a function at line 42"));

    expect(failure.status).toBe(500);
    expect(failure.code).toBe("INTERNAL");
    expect(failure.message).toBe(GENERIC_MESSAGE);
    expect(failure.problems).toEqual([]);
  });

  it("handles something that is not an error at all", () => {
    expect(describeFailure("just a string").status).toBe(500);
    expect(describeFailure(undefined).message).toBe(GENERIC_MESSAGE);
  });

  it("passes through a framework 404 with a string body", () => {
    const failure = describeFailure(new HttpException("Cannot GET /api/nope", 404));

    expect(failure.status).toBe(404);
    expect(failure.code).toBe("NOT_FOUND");
    expect(failure.message).toBe("Cannot GET /api/nope");
  });

  it("joins the array of sentences Nest's validation pipe produces", () => {
    const failure = describeFailure(
      new HttpException({ message: ["name should not be empty", "role must be a string"] }, 400),
    );

    expect(failure.message).toBe("name should not be empty role must be a string");
  });

  it("ignores a malformed problems array instead of failing on it", () => {
    const failure = describeFailure(
      new HttpException({ code: "X", problems: ["nope", { field: "a" }, null] }, 400),
    );

    expect(failure.problems).toEqual([]);
  });

  it("falls back to a sensible code for a status with no default", () => {
    expect(describeFailure(new HttpException("teapot", 418)).code).toBe("REJECTED");
  });
});
