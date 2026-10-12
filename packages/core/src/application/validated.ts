/**
 * Shared shapes for the verbs in this folder.
 *
 * The use-cases do not throw on bad input. They return a list of field problems, so the API
 * can answer `400` with something the form can point at, and a test can assert on the
 * problems instead of on an error message.
 */

export interface FieldProblem {
  /** The field name the caller used, e.g. "name". */
  readonly field: string;
  /** Plain English, shown next to the field. */
  readonly problem: string;
}

export type Validated<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly FieldProblem[] };

export const valid = <T>(value: T): Validated<T> => ({ ok: true, value });

export const invalid = <T>(...problems: readonly FieldProblem[]): Validated<T> => ({
  ok: false,
  problems,
});

/** Trim, collapse runs of spaces, and cut to a limit. */
export function cleanText(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}
