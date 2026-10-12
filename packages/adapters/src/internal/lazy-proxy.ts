/**
 * Build a service on first use, not at boot.
 *
 * Duke must start with an empty `.env`, because the last step of the project is "paste your
 * keys", and a server that refuses to boot cannot tell you *which* key is missing. NestJS
 * builds every provider during bootstrap, so a provider that connects to Postgres in its
 * constructor would take the whole API down before `/api/ready` could answer.
 *
 * The proxy below defers the real construction to the first method call. That call throws
 * the friendly `ENV_MISSING` error from `@duke/shared`, which names the key and the page to
 * copy it from.
 */
export function lazyProxy<T extends object>(make: () => T): T {
  let real: T | null = null;

  const resolve = (): T => {
    real ??= make();
    return real;
  };

  return new Proxy({} as T, {
    get(_target, property, receiver) {
      // Keep `then` undefined so the proxy is not mistaken for a promise.
      if (property === "then") return undefined;
      const value: unknown = Reflect.get(resolve() as object, property, receiver);
      return typeof value === "function" ? value.bind(resolve()) : value;
    },
    has(_target, property) {
      return property in resolve();
    },
    ownKeys() {
      return Reflect.ownKeys(resolve() as object);
    },
    getOwnPropertyDescriptor(_target, property) {
      return Reflect.getOwnPropertyDescriptor(resolve() as object, property);
    },
  });
}
