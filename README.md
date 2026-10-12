# Duke

A phone-call style app for practising English out loud, with **one AI friend who can
become many characters** (teacher, senior developer, barista, savage friend, ...) and
speaks with real emotion — on free tiers.

- **Docs:** [`docs/architecture.md`](docs/architecture.md) · [`docs/build-plan.md`](docs/build-plan.md) · [`docs/deploy.md`](docs/deploy.md) · [`docs/keys.md`](docs/keys.md)
- **Design source:** [`duke.pen`](duke.pen) (pen.dev)

## Repo layout

```
apps/
  web/      Next.js 16 — the screens (UI only)
  api/      NestJS — REST API ("the office")
  agent/    LiveKit worker — the voice loop ("the actor")
packages/
  core/     the heart: domain rules + ports (no framework, no I/O)
  adapters/ real implementations of the ports
  shared/   tiny shared toolkit (env, logging, archiving)
infra/      Dockerfiles, Caddyfile, and the local Postgres + Redis compose file
scripts/    doctor.mjs — "is this machine ready?"
```

Dependencies point **inward only**: `apps/* -> packages/adapters -> packages/core`.
`core` imports nothing from the outside world.

## Requirements

- Node.js 22+
- pnpm 10+
- Docker (for local Postgres + Redis; and for the production stack)

## Quick start

```bash
pnpm install
cp .env.example .env        # then fill in your keys — docs/keys.md has all six accounts
pnpm run doctor             # tells you exactly which key is still missing
pnpm build                  # builds packages + apps

# local services (Postgres with pgvector, Redis)
docker compose -f infra/docker-compose.yml up -d

# the tables (derived from packages/adapters/src/drizzle/schema.ts)
pnpm run db:push

# run things
pnpm --filter @duke/api start    # API   -> http://localhost:3001/api/health
pnpm --filter @duke/web dev      # web   -> http://localhost:3000
pnpm --filter @duke/agent start  # voice worker
```

Note that the root `pnpm dev` compiles everything but does **not** start the API — run the
three commands above, each in its own terminal.

## Scripts

| Command | What it does |
|---|---|
| `pnpm build` | build every package and app |
| `pnpm typecheck` | type-check every package and app |
| `pnpm test` | run the tests in every package |
| `pnpm dev` | watch/compile everything in parallel |
| `pnpm run doctor` | check this machine's setup: keys, shapes, log folder, ports, Postgres, Redis |
| `pnpm run db:push` | create or update the database tables from the schema file |

> `pnpm run doctor`, not `pnpm doctor` — pnpm has its own `doctor` command and it takes the
> name. `pnpm run` always means this project's script.

## Deploying

`docker-compose.prod.yml` (repo root) + `infra/Dockerfile.{api,web,agent}` + `infra/Caddyfile`
run four containers on a VPS: the API, the web app, the voice worker, and Caddy for HTTPS and for
holding everything on one origin. The step-by-step is [`docs/deploy.md`](docs/deploy.md).

## Notes

- **Configuration.** Every variable is listed in `.env.example` (committed). Copy it to `.env`
  and fill in your own values. `.env` is git-ignored — never commit real keys.
- **Logs.** Every line goes to stdout *and* to two daily files: `logs/all/<service>.<date>.log`
  with everything, and `logs/error/<service>.<date>.log` with only the problems. JSON in
  production, readable in development. Requests carry an `x-request-id`, secrets are redacted,
  and finished days are gzipped into `logs/archive/` and pruned after `LOG_RETENTION_DAYS`
  (14 by default). `logs/` is git-ignored.
- **TypeScript is pinned at the workspace root** (v7). Nest 12 needs >= 6. TS 6+ removed
  `baseUrl` and needs an explicit `rootDir`.
- **The Nest CLI is not used.** It needs TypeScript's programmatic compiler API, which TS 7 no
  longer ships. The API compiles with plain `tsc` and runs `node dist/main.js` —
  `emitDecoratorMetadata` still works, so DI is fine.
- **pnpm blocks postinstall scripts by default.** `pnpm.onlyBuiltDependencies: ["esbuild"]`
  in the root `package.json` allows the one we need (vitest).
