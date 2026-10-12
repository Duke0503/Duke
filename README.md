# Duke

A phone-call style app for practising English out loud, with **one AI friend who can
become many characters** (teacher, senior developer, barista, savage friend, ...) and
speaks with real emotion — on free tiers.

- **Docs:** [`docs/architecture.md`](docs/architecture.md) · [`docs/build-plan.md`](docs/build-plan.md)
- **Design source:** [`duke.pen`](duke.pen) (pen.dev)

## Repo layout

```
apps/
  web/      Next.js 16 — the 8 screens (UI only)
  api/      NestJS — REST API ("the office")
  agent/    LiveKit worker — the voice loop ("the actor")
packages/
  core/     the heart: domain rules + ports (no framework, no I/O)
  adapters/ real implementations of the ports (M1)
  shared/   tiny shared toolkit
infra/      docker-compose for local Postgres + Redis
```

Dependencies point **inward only**: `apps/* -> packages/adapters -> packages/core`.
`core` imports nothing from the outside world.

## Requirements

- Node.js 22+
- pnpm 10+
- Docker (for local Postgres + Redis)

## Quick start

```bash
pnpm install
cp .env.example .env        # then fill in your keys
pnpm build                  # builds packages + apps

# local services (Postgres with pgvector, Redis)
docker compose -f infra/docker-compose.yml up -d

# run things
pnpm --filter @duke/api start    # API   -> http://localhost:3001/api/health
pnpm --filter @duke/web dev      # web   -> http://localhost:3000
pnpm --filter @duke/agent dev    # voice worker (placeholder until M1)
```

## Scripts

| Command | What it does |
|---|---|
| `pnpm build` | build every package and app |
| `pnpm typecheck` | type-check every package and app |
| `pnpm test` | run the tests (currently `@duke/core`) |
| `pnpm dev` | watch/compile everything in parallel |

## Notes

- **Configuration.** Every variable is listed in `.env.example` (committed). Copy it to `.env`
  and fill in your own values. `.env` is git-ignored — never commit real keys.
- **Logs.** Every line goes to stdout *and* to `logs/<service>.<date>.log` — JSON in production,
  readable in development. Requests carry an `x-request-id`, secrets are redacted, and finished
  days are gzipped into `logs/archive/` and pruned after `LOG_RETENTION_DAYS` (14 by default).
  `logs/` is git-ignored.

- **TypeScript is pinned at the workspace root** (v7). Nest 12 needs >= 6. TS 6+ removed
  `baseUrl` and needs an explicit `rootDir`.
- **The Nest CLI is not used.** It requires TypeScript's programmatic compiler API, which
  TS 7 no longer ships. We compile the API with plain `tsc` and run `node dist/main.js` —
  `emitDecoratorMetadata` still works, so DI is fine.
- **pnpm blocks postinstall scripts by default.** `pnpm.onlyBuiltDependencies: ["esbuild"]`
  in the root `package.json` allows the one we need (vitest).
