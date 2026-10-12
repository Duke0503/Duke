/**
 * Injection tokens for the ports.
 *
 * NestJS binds by token, and an interface is not a runtime value, so each port needs a real
 * symbol. Using `Symbol` rather than a string means two modules can never collide by typo.
 */

export const ADAPTERS = Symbol("DUKE_ADAPTERS");
export const USER_REPOSITORY = Symbol("DUKE_USER_REPOSITORY");
export const CHARACTER_REPOSITORY = Symbol("DUKE_CHARACTER_REPOSITORY");
export const SESSION_REPOSITORY = Symbol("DUKE_SESSION_REPOSITORY");
export const CACHE = Symbol("DUKE_CACHE");
export const CLOCK = Symbol("DUKE_CLOCK");
export const SPEECH_TO_TEXT = Symbol("DUKE_SPEECH_TO_TEXT");
export const BRAIN = Symbol("DUKE_BRAIN");
export const VOICE = Symbol("DUKE_VOICE");
export const TRANSPORT = Symbol("DUKE_TRANSPORT");
