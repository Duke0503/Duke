/**
 * Build a service on first use, not at boot.
 *
 * Duke must start with an empty `.env`, because the last step of the project is "paste your
 * keys", and a server that refuses to boot cannot tell you *which* key is missing. NestJS
 * builds every provider during bootstrap, so a provider that connects to Postgres in its
 * constructor would take the whole API down before `/api/ready` could answer.
 *
 * The proxy below defers the real construction to the first method call. That call throws the
 * friendly `ENV_MISSING` error from `@duke/shared`, which names the key and the page to copy it
 * from.
 *
 * ## Two things the framework does to every provider
 *
 * This file learned both the hard way, from a boot that died inside Nest after the routes were
 * already mapped:
 *
 *   1. **It reads properties.** `DiscoverableMetaHostCollection` reads `instance.constructor`,
 *      and `util.inspect` walks symbols. So a *read* must never resolve anything: symbols and
 *      `then` answer `undefined`, and every other string key answers a small function that
 *      resolves only *when called*.
 *   2. **It calls lifecycle hooks if the property exists.** Nest does `instance.onModuleInit`
 *      and calls it when it is a function. Answering a deferred function for those names made
 *      boot call `onModuleInit` on a Postgres repository, which is the one thing this whole
 *      file exists to prevent. {@link DEFERRED_EXCEPTIONS} lists them so they are absent.
 *
 * The last point relies on a rule the ports keep: **a port is only methods**. If a port ever
 * gains a plain data field, reading it would hand back a function instead of the value, and
 * `lazyProxy` is the wrong tool for that field.
 *
 * The remaining traps keep the proxy looking like a small, empty, ordinary object, so nothing
 * that walks the container (`Object.keys`, `in`) reaches the real service either.
 */
export function lazyProxy<T extends object>(make: () => T): T {
  let real: T | null = null;

  const resolve = (): T => {
    real ??= make();
    return real;
  };

  /** One member, resolved and called at call time. */
  const member = (property: string) =>
    function lazyMember(...args: unknown[]): unknown {
      const target = resolve() as unknown as Record<string, unknown>;
      const value = target[property];
      if (typeof value !== "function") {
        throw new TypeError(`lazyProxy: "${property}" is not a method of the service.`);
      }
      return value.apply(target, args);
    };

  return new Proxy({} as T, {
    get(_target, property) {
      if (typeof property !== "string") return undefined;
      if (DEFERRED_EXCEPTIONS.has(property)) return undefined;
      return member(property);
    },
    has: () => false,
    ownKeys: () => [],
    getOwnPropertyDescriptor: () => undefined,
  });
}

/**
 * Property names that must answer `undefined`, never a deferred method.
 *
 * Two kinds, and both are about the property merely being *seen*:
 *
 *   - `then`, so `await proxy` does not treat the service as a promise,
 *   - Nest's lifecycle hooks. Nest calls them when the property exists, so a deferred function
 *     here means boot would run a lifecycle hook on an unconnected adapter.
 *
 * If a future Nest version adds another hook, the failure mode is a loud crash on boot that
 * names the method — add it here.
 */
const DEFERRED_EXCEPTIONS: ReadonlySet<string> = new Set([
  "then",
  "onModuleInit",
  "onModuleReplace",
  "onApplicationBootstrap",
  "onModuleDestroy",
  "beforeApplicationShutdown",
  "onApplicationShutdown",
]);
