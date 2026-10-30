# Breeze RMM - Agent Context

## Project Overview

Breeze is a fast, modern Remote Monitoring and Management (RMM) platform for MSPs and internal IT teams. Target: 10,000+ agents with enterprise features.

## Tech Stack

- **Frontend**: Astro + React Islands
- **API**: Hono (TypeScript)
- **Database**: PostgreSQL + Drizzle ORM
- **Queue**: BullMQ + Redis
- **Agent**: Go (cross-platform)
- **Real-time**: HTTP polling + WebSocket
- **Remote Access**: WebRTC

## Contributor instructions

This file holds rules and pointers. **The pointed-to docs are mandatory reading when their trigger applies** — the detail lives there, not here.

| Trigger | Read first |
|---|---|
| Choosing a model or delegating to Codex | `docs/agents/model-routing.md` |
| Adding a table, adding a column to an org-cascade table, or any config/policy table | `docs/agents/tenancy-rls.md` |
| Writing or renaming a migration | `apps/api/migrations/README.md` |
| Running a scoped test or a contract/integration suite; deciding which CI job catches what | `docs/agents/testing.md` (conventions: `breeze-testing` skill) |
| Touching `pages/settings/**` or a `*Settings*` component | `docs/agents/settings.md` |
| Merging a PR, or deploying to the EU/US droplets | `docs/agents/merge-and-deploy.md` |
| Bringing up / tearing down a local Docker stack | `docs/agents/local-stacks.md` (per-worktree: `worktree-stack` skill) |

## Monorepo Layout

- `apps/`: api, web, portal, mobile, viewer, helper, docs, Office add-ins, m365-graph-{read,actions}-executor
- `packages/`: shared (`types/`, `validators/` (Zod), `utils/`), office-addin-core, extension-{sdk,web-sdk,testkit}
- `ee/`: first-party extensions compiled into the API image; each loads only when its enable flag is set (`BREEZE_WORKSPACE_ENABLED`)
- `agent/`: Go agent (own Makefile; `make run`)
- Schema: `apps/api/src/db/schema/`. Routes: `apps/api/src/routes/`, each exports `xxxRoutes`, mounted in `index.ts`.

## Key Patterns

### Multi-Tenant Hierarchy
```
Partner (MSP) → Organization (Customer) → Site (Location) → Device Group → Device
```

### Tenant Isolation / RLS (READ BEFORE ADDING TABLES)
Full contract, the six tenancy shapes, and the cascade/export registration table: **`docs/agents/tenancy-rls.md`**. The rules that bite:

- API connects as unprivileged `breeze_app`. Every tenant-scoped table has RLS enabled + forced + policies **in the same migration that creates it**. No app-layer-only fallback.
- **DB context helpers** (`apps/api/src/db/index.ts`): `withDbAccessContext` on the request path; `withSystemDbAccessContext` for background/seeds (call `runOutsideDbContext` first if inside a request). Bare pool in request code is forbidden.
- Every composite FK referencing an `org_id` column is `DEFERRABLE INITIALLY IMMEDIATE` (org merge defers constraints).
- **A new `org_id` table is not done until it is registered** in `CORE_ORG_CASCADE_DELETE_ORDER`, `orgMergeRegistry.ts`, and `CORE_TENANT_EXPORT_POLICY` — plus the device/ticket lists when it has those columns. RLS coverage does not imply cascade coverage. Code review caught this 0/5 times; contract tests 5/5. Grep, don't judge.
- **Adding a column** to an org-cascade table needs an export-policy classification; any `json`/`jsonb`/`bytea` column is `excludedOpen`.
- The org-cascade and export-policy suites fail only under **Integration Tests**, never Test API. A stacked PR (base ≠ main) runs no CI: `gh workflow run CI --ref <branch>`.

### Partner-Wide First (config/policy tables) — epic #2135
New config-ish tables (policies, templates, rules, windows, baselines) default to `org_id` XOR `partner_id`; `org_id NOT NULL` needs a stated justification in the PR. Org-first designs have needed painful retrofits every time (#1724, #2126–#2129). The 7-step playbook (migration, write gate `canManagePartnerWidePolicies`, SELECT-only partner read branch, config-policy linkage, worker fan-out by device org's partner, tests + UI, repo-wide `<table>.orgId` sweep) is in `docs/agents/tenancy-rls.md`.

### Database Schema Location
- `apps/api/src/db/schema/` - All Drizzle schema definitions
- Key tables: devices, users, organizations, sites, alerts, scripts, automations

### API Routes
- `apps/api/src/routes/` - Hono route handlers
- Pattern: Export `xxxRoutes` from each file, mount in `index.ts`

### File Size Guideline
- **Aim to keep files under 500 lines** as a soft guideline, not a hard rule. Use judgment — if a file is cohesive and readable at 600 lines, that's fine. Split when a file becomes hard to navigate or mixes unrelated concerns, not just because it crossed a line count.
- **Declarative files** (e.g. `aiTools*.ts`, schema definitions) can naturally run longer since they're mostly self-contained registration blocks.
- Follow the `aiTools*.ts` pattern: one thin hub file for registry/exports, per-domain files for implementations (e.g. `aiToolsDevice.ts`, `aiToolsNetwork.ts`).
- For route files, split by resource. For service files, split by domain. Helpers used by multiple files can be duplicated locally or extracted to a shared utils file.
- **Do not proactively split files** that are working well just to meet a line count target. Only split when it improves clarity or maintainability.

### Context Preservation
- **Prefer subagents for research, exploration, and isolated tasks** to keep the main conversation context lean and avoid hitting context limits during long sessions.
- Use subagents for: codebase searches, file reading/analysis, PR reviews, build log inspection, and any work that produces large output.
- Keep the main context for: decision-making, coordinating work, and user interaction.

### URL State in Components
- Use `window.location.hash` (`#value`) for client-side UI state like selected tabs, selected items in lists, etc. See `DeviceDetails.tsx` and `OrganizationsPage.tsx` for examples.
- Do **not** use query params (`?key=value`) for transient UI state — keep the pattern consistent.

### No Internal Infrastructure Details in Public Code
- **Never commit** IP addresses, server hostnames, datacenter regions, droplet IPs, or internal domain mappings to the public repo.
- Region-specific values belong in `.env` files (gitignored), not in code or config templates.
- `.env.example` files should use generic placeholders (`host`, `password`, `your-domain.example.com`), not real values.
- The `internal/` directory is gitignored and safe for strategy docs, internal notes, and infra-specific details.

### Shared Code
- `packages/shared/src/types/` - TypeScript interfaces
- `packages/shared/src/validators/` - Zod schemas
- `packages/shared/src/utils/` - Utility functions

### Web Mutation Handlers — `runAction`

**Mutation handlers must surface outcome via `runAction`.** Web action handlers that POST/PUT/PATCH/DELETE should wrap the request in `runAction` (`apps/web/src/lib/runAction.ts`) so success/failure is always shown to the user. `runAction` also treats HTTP-200 `{success:false}` / `{testResult:{success:false}}` response bodies as failures (not silent no-ops).

Catch pattern for callers:
```ts
if (err instanceof ActionError && err.status === 401) return; // let auth redirect handle it
if (!(err instanceof ActionError)) showToast({ type: 'error', ... }); // non-401 ActionError already toasted by runAction
```

The `no-silent-mutations` test (`apps/web/src/lib/__tests__/no-silent-mutations.test.ts`) guards the adopted set. Legitimate exceptions (typed service layers, aggregate/partial-success handlers with inline error UI) are recorded in `apps/web/src/lib/runActionAllowlist.ts`. Spec: `docs/superpowers/specs/web-ui/2026-05-15-ws-a-action-feedback-design.md`.

### Settings — one concept, one home
A setting is edited in one place per level, lives with its domain, and resolves partner default → org override → snapshot on the document. Full nine rules: `docs/agents/settings.md`. **Rule 9:** a PR that adds a setting states its home, level, resolver, and the count of places the concept is configured before and after (PR template checkbox). Nav registration enforced by `settingsPageRegistry.test.ts`.

### Schema Migration Workflow
Hand-written SQL in `apps/api/migrations/` — never `drizzle-kit generate`/`push`. **Read `apps/api/migrations/README.md` before writing one.** The rules that bite:
- Name it to sort **after the newest committed migration** — check, don't assume today's date (shipped names run ahead of real time). Prefer `YYYY-MM-DD-HHMMSS-<slug>.sql`. `2026-08-06` is a closed block.
- Idempotent; no inner `BEGIN;`/`COMMIT;`; never edit or rename a shipped migration.
- Any file that writes rows elects system scope first: `SELECT set_config('breeze.scope', 'system', true);` — otherwise writes silently match zero rows under forced RLS (`migrationRlsScope.test.ts`).
- Then `pnpm db:check-drift`.

---

## Working Style

### Design decisions
- Choose the design that is best long-term, not fastest to implement.
- For consequential, hard-to-reverse choices (new tables/tenancy shapes, cross-module contracts, public API surface), convene an advisor quorum: form your own position, get an independent read-only opinion from another model or agent (the Codex recipe is in [optional harness workflows](docs/agents/harness-workflows.md)). Agree → proceed. Disagree → resolve on the merits or surface it to the user with a recommendation.

### When to ask vs. proceed
- **Proceed** on reversible decisions inside the task's scope (naming, layout, test structure, choosing among repo patterns); note the default in one line.
- **Ask first** for destructive or hard-to-reverse actions (data deletion, force-push, prod changes, closing issues/PRs, external comms), real scope changes, and product/UX calls with no precedent. Design-*quality* questions go to the advisor quorum, not the user.
- Never block long-running work on a question: take the conservative default, keep going, batch open questions at the end.
- When asking: bold one-sentence question first, options as short labeled bullets with pros/cons, then **Recommend X** — one-line why.

### Verbosity
Lead with the outcome. Detail belongs in PR descriptions and commits; chat gets what changed, what's risky, what needs input. One status line per milestone during long work.

### Efficient coding & review
Match rigor to blast radius: full ceremony for tenancy/RLS, auth, migrations, billing, agent-shipped code; implement + typecheck + targeted tests for mechanical work. Run targeted tests while developing, full + contract suites before PR (always when tenancy/cascade code was touched). At most one independent review round.

### Subagents & main-context preservation
Delegate exploration, large reads, log/test-output inspection, and reviews; keep the main context for decisions. Subagent prompts are self-contained (paths, question, return shape). **Never take a subagent's "done" at face value** — verify the commit exists, the tests ran, and it's on the right branch. Checkpoint-commit on long runs.

## Optional harness workflows

Claude-to-Codex delegation, model routing, and plugin-based feature tracking are preserved in [optional harness workflows](docs/agents/harness-workflows.md). They are optional and do not require contributors using one harness to install the other.

## Testing
Vitest (API, web, shared), Go `testing` (`go test -race ./...`), Playwright E2E (`data-testid` only). Tests sit alongside source. CI jobs `test-api`, `test-web`, `test-agent` and the 16-shard `integration-test` all block PRs. `pnpm test` does **not** run the RLS/integration contract suites. Scoped-run traps (never `pnpm --filter <pkg> test -- --run <path>`; vitest path filters are substring matches), contract-suite commands and CI job map: **`docs/agents/testing.md`**.

### Frameworks & Configuration
- **API**: Vitest — `apps/api/vitest.config.ts` (unit), `vitest.config.rls.ts` (RLS), `vitest.integration.config.ts` (integration)
- **Web**: Vitest + jsdom — `apps/web/vitest.config.ts`
- **Agent**: Go standard `testing` package — `go test -race ./...`
- **Shared**: Vitest — `packages/shared/vitest.config.ts`
- **E2E**: Playwright Test (TypeScript), `data-testid` based — `e2e-tests/playwright.config.ts`, specs under `e2e-tests/tests/*.spec.ts`, Page Objects under `e2e-tests/pages/`. Tests query DOM via `data-testid` attributes only (not text/role/CSS) — see `e2e-tests/README.md` for the convention.

### Test File Placement
- Place test files **alongside source files**, not in separate directories
- API: `routes/devices.ts` → `routes/devices.test.ts`
- Go: `internal/discovery/scanner.go` → `internal/discovery/scanner_test.go`
- Shared: `validators/filters.ts` → `validators/filters.test.ts`

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development servers
pnpm dev

# Database operations
export DATABASE_URL="postgresql://breeze:breeze@localhost:5432/breeze"
pnpm db:check-drift  # Verify schema matches migrations (no drift)
pnpm db:studio       # Open Drizzle Studio

# Agent development
cd agent && make run
```
Node is pinned to 22.23.4 (`.nvmrc`). No root typecheck script — typecheck runs via turbo/CI.

Each worktree needs its own dependency installation: run `pnpm install --frozen-lockfile` before tests. See [Development Setup](CONTRIBUTING.md#development-setup).

**Tear down what you bring up** (`pnpm wt-stack down`, `pnpm test-stack down`, compose `down -v`) and say what you left running — see `docs/agents/local-stacks.md`. Deleting a config file? Sweep compose bind mounts in the same PR (`composeBindMounts.test.ts`).

## PR Merge & Deploy
- Merge with `gh pr merge <N>` — the merge queue owns strategy. **Never `--admin`** except a declared emergency, followed by `gh workflow run CI --ref main`.
- A production deploy updates `BREEZE_VERSION`, pulls/ups the named services, prunes images, then **asserts version parity across every running service** (the service list goes stale). Required env vars and the full runbook: `docs/agents/merge-and-deploy.md`.
- Watchtower must never auto-update `breeze-api`/`breeze-web` (`scripts/security/check-supply-chain-hardening.sh`).

## GitHub conventions

### GitHub Naming
- Do not use the `codex/` branch prefix for Breeze work. This applies even when Codex creates the branch or PR.
- Follow the existing GitHub branch patterns: `fix/<issue>-<short-slug>`, `feat/<issue>-<short-slug>`, `docs/<short-slug>`, `chore/<short-slug>`, `ops/<short-slug>`, `hotfix/<short-slug>`, or `integration/<short-slug>`.
- If there is no issue number, use the same prefix with a concise slug, e.g. `fix/<short-slug>` or `feat/<short-slug>`.
- Use `pr-####` or `pr-####-review` only when the branch is specifically for inspecting or reviewing an existing PR.
- Keep branch slugs lowercase, kebab-case, and specific to the work. Avoid agent/tool/vendor prefixes such as `codex/`, `claude/`, or similar.
- PR titles should follow the existing convention where useful: `fix(scope): summary`, `feat(scope): summary`, `docs(scope): summary`, or `chore(scope): summary`. Include the issue number as `(#1234)` when the work is tied to an issue.

### Linking Issues from a PR

The PR **body** decides whether the issue survives the merge. Pick deliberately —
this is not a stylistic choice.

- **`Closes #1234`** — the PR fully resolves the issue. Use this by default. The
  issue closes automatically on merge and leaves the backlog.
- **`Refs #1234`** — the PR resolves only part of the issue, or the issue is a
  community report whose reporter still has to verify on their own hardware. When
  you use `Refs`, **state in the PR body which half shipped and which did not** —
  a bare `Refs` with no scope note is how a fixed issue becomes permanent backlog.

`Refs` was the de-facto default for a long time and it does not close anything, so
~15 fully-fixed issues sat open for weeks (#2728, #2814, #2894, #2895, #2896, #2913,
#2950, #2974, #2997, #2999, #3000, #3006, #3201 among them). Default to `Closes`;
reach for `Refs` only when one of the two reasons above actually applies.

Mechanics: `Closes #X #Y` auto-closes **only** `#X`. Repeat the keyword per issue —
`Closes #X, closes #Y`.

## Docker Compose Modes

Three named override files exist — no auto-applied `docker-compose.override.yml` by default.

| File | Purpose |
|---|---|
| `docker-compose.override.yml.dev` | Code-mounted hot-reload (builds from `Dockerfile.api.dev` / `Dockerfile.web.dev`) |
| `docker-compose.override.yml.ghcr` | Pre-built GHCR images (linux/amd64) |
| `docker-compose.override.yml.local-build` | Native arm64 local build from production Dockerfiles |

```bash
# Dev mode (code-mounted, hot-reload)
docker compose -f docker-compose.yml -f docker-compose.override.yml.dev up --build -d

# GHCR mode (pre-built images)
docker compose -f docker-compose.yml -f docker-compose.override.yml.ghcr up -d

# Local build mode (native arm64)
docker compose -f docker-compose.yml -f docker-compose.override.yml.local-build up --build -d

# Do not create a root docker-compose.override.yml for shared commits;
# Docker Compose auto-loads that filename and can weaken production defaults.
#
# For local-only use, symlink whichever mode you want as default, but do not commit it:
# ln -sf docker-compose.override.yml.dev docker-compose.override.yml
# docker compose up --build -d
```

## Test-writing conventions

### Writing API Route Tests (Vitest)
- Mock Drizzle ORM query chains matching the exact chain pattern in the source (e.g., `select().from().where()`)
- Always test **multi-tenant isolation** — verify org-scoped data can't be accessed cross-org
- Test all HTTP methods, auth/authz, Zod validation failures, not-found, and error cases
- Use proper UUIDs in mock data — Zod validates UUID format and will reject `'other-org'`
- Avoid trailing slashes in test URLs — Hono sub-routers return 404 for trailing slashes
- `vi.mock` factories are hoisted — don't reference module-level `const` values inside them; use literal values instead
- Read 2-3 existing test files in the same directory before writing new ones to match patterns

### Writing Go Agent Tests
- Use **table-driven tests** for functions with multiple input/output combinations
- Always run with `-race` flag to catch data races
- Mock external dependencies (network, OS, filesystem) — never make real network calls
- Use build tags for platform-specific tests: `//go:build !windows` or `//go:build darwin`
- Test nil/empty inputs, error paths, and concurrency safety (spawn goroutines in tests)
- Place test helpers in the same package, not in a separate `_test` package

### Writing Shared Validator Tests
- Test valid inputs, invalid inputs, boundary values, and Zod defaults/coercion
- For discriminated unions, test each variant separately
- Test `omitempty`/optional fields with both present and absent values
- For schemas with `superRefine`, test all validation branches

### What Every New Feature Must Test
1. **Happy path** — basic success case
2. **Auth/authz** — unauthenticated, wrong role, wrong org
3. **Validation** — missing required fields, invalid types, boundary values
4. **Multi-tenant isolation** — cross-org access denied
5. **Error cases** — not found, conflict, server error
6. **Edge cases** — empty arrays, nil inputs, concurrent access

### Running Tests Locally
```bash
# All tests
pnpm test

# API only
pnpm --filter @breeze/api test:run

# Go agent (with race detection)
cd agent && go test -race ./...

# Specific Go package
cd agent && go test -race ./internal/discovery/...

# E2E
cd e2e-tests && pnpm test
```
