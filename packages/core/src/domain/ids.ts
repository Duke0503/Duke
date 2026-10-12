export type UserId = string;
export type CharacterId = string;
export type SessionId = string;
export type TurnId = string;
export type CorrectionId = string;
export type VocabularyId = string;

/**
 * Makes a new id.
 *
 * Declared here, implemented elsewhere on purpose. `core` is pure — it reads no clocks, no
 * environment and no platform globals — so anything that creates a real id has to be handed
 * in. Tests pass a counter, the API passes `crypto.randomUUID`.
 */
export type NewId = () => string;
