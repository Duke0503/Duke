export type UserId = string;
export type CharacterId = string;
export type SessionId = string;
export type TurnId = string;
export type CorrectionId = string;
export type VocabularyId = string;

/**
 * Make a new id.
 *
 * Kept behind a parameter on the functions that need it, with this as the default, so a
 * test can pass a counter instead and get a predictable result. `crypto.randomUUID` is a
 * global in Node 24 and in every browser we support.
 */
export const defaultNewId = (): string => globalThis.crypto.randomUUID();

export type NewId = () => string;
