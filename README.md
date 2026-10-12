# ShopX GraphQL backend

The shared API for the storefront, admin portal, and React Native app. Oracle stores persistent data; Redis stores sessions and cached responses. This is an independent repository, separate from the other three repositories in the parent `shopx` directory.

## Run this repository independently

This repository owns its source, lockfile, Dockerfile, tests, and [standalone Compose configuration](compose.yaml). It does not require the parent ShopX directory or sibling checkouts. Other services are accessed through configurable network endpoints and must implement the expected GraphQL/API contract; a different API schema requires a client adapter.

From this repository, create the private container configuration only if it does not already exist:

```bash
cp .env.docker.example .env.docker
```

Edit `.env.docker` for your external services, then run:

```bash
docker compose --env-file .env.docker up -d --build --wait
docker compose --env-file .env.docker ps
docker compose --env-file .env.docker logs --tail 80
docker compose --env-file .env.docker down
```

The standalone project has its own Compose name. Change `APP_PORT` if the workspace stack already occupies the default host port. `host.docker.internal` reaches services published on the host; `localhost` inside a container refers to that container. Use a reachable hostname for remote APIs/databases. Do not copy private environment files into images.

Provide an existing Oracle schema, `DB_USER`, `DB_PASSWORD`, `DB_CONNECT_STRING`, and `JWT_SECRET`. Redis is an external dependency configured by `REDIS_URL`; `REDIS_DISABLED=true` explicitly selects process-local sessions for isolated development only. This Compose file never provisions or seeds Oracle. The container waits for the schema and Redis before starting the development watcher, avoiding the Docker-restart race where the watcher stays alive after API startup fails.

In the full local workspace, use the parent `docker-compose.yml` / `node scripts/compose.mjs up` instead. It orchestrates shared dependencies and configures service DNS centrally; it does not merge these Git repositories or require their standalone Compose projects to run alongside it.

## Stack and requirements

- Node **22.x** (`package.json`: `>=22 <23`; `.nvmrc`: `22.11.0`), TypeScript, and Express. Use `nvm use` if you manage Node with nvm.
- GraphQL through `@graphql-tools/schema` and `express-graphql`.
- Oracle 19c locally, using the `oracledb` Thin driver. The current configuration does not require Oracle Instant Client.
- Redis for shared sessions and caching. An explicit in-memory mode exists but loses sessions on restart and does not share them across processes.
- Yarn Classic 1.22 and dependencies pinned in `yarn.lock`. For host development, run `yarn install --frozen-lockfile` after selecting Node 22; rebuild dependencies if their installed binaries belong to another runtime/platform.

## Start in the existing workspace

From the parent `shopx` directory:

```bash
node scripts/compose.mjs up
```

Compose builds the backend image, starts Redis, and waits for backend readiness before starting clients. GraphQL is available at `http://localhost:4000/graphql` and `http://api.shopx.localhost/graphql`. The `src/` directory is mounted for live recompilation. Host dependency installation is not required for this mode.

The recovered database remains **`oracle19 → ORCLCDB → AREVY`**, in `CDB$ROOT`. The launcher reads `../.local/database.json`, starts the existing container, and attaches it to Docker networking with alias `oracle`. The backend uses `oracle:1521/ORCLCDB`; no new database, reset, or seed is created.

Compose Redis is `redis:6379/1`, backed by a persistent volume. The previous `clever_wilson` instance is retained for the legacy host-process workflow. Sign in again after switching: sessions are not migrated between Redis instances.

From the parent directory, `node scripts/compose.mjs logs backend` shows logs and `node scripts/compose.mjs check` verifies application connectivity without mutations. The [workspace README](../README.md) covers startup/shutdown, internal DNS, private identity configuration, and host-process alternatives. Parent scripts are not included in a standalone clone of this repository.

Accounts come from Oracle; startup does not create a default account. The explicitly installed `general-store-v1` pack provides four new local accounts in `AREVY`, with generated credentials documented only in the workspace's private `docs/local-accounts.private.md`. `../.local/admin-access.json` now selects that pack's general administrator for workspace tests; its former `SHOPX_LOCAL` contents were backed up privately. Existing recovered accounts and passwords were preserved.

## Standalone setup and configuration

For a fresh clone, copy `.env.example` to `.env` if `.env` does not already exist, then provide your instance's settings. The following is a template, not a set of working credentials:

```dotenv
PORT=4000
DB_USER=<schema-user>
DB_PASSWORD=<existing-password>
DB_CONNECT_STRING=127.0.0.1:1521/ORCLCDB
JWT_SECRET=<random-local-secret>
REDIS_URL=redis://127.0.0.1:<redis-port>/1
```

With dependencies installed, Oracle/Redis configured, and an existing schema accessible, run `npm run dev`. Do not start a second server on a port already owned by Compose or the host launcher. An external Oracle instance can be used in standalone mode by setting `DB_CONNECT_STRING` to its reachable host, port, and service; normal startup does not initialize its schema.

| Variable | Behavior |
| --- | --- |
| `DB_USER`, `DB_PASSWORD`, `DB_CONNECT_STRING` | Oracle connection; never commit credentials |
| `DB_POOL_MIN`, `DB_POOL_MAX`, `DB_POOL_INCREMENT` | Defaults: `1`, `4`, `1` |
| `DB_PASSWORD_ROTATE`, `DB_PASSWORD_NEW` | Optional rotation on `ORA-28001`; disabled by default. The replacement must differ from the current password |
| `JWT_SECRET` | Required to issue and verify Bearer tokens |
| `SESSION_COOKIE_NAME`, `SUPPORT_SESSION_COOKIE_NAME` | Defaults: `sid`, `support_sid` |
| `SESSION_TTL_SECONDS`, `IMPERSONATION_TTL_SECONDS` | Defaults: 604800 and 60 seconds |
| `REDIS_URL` | Redis URL including port and logical database; alternatively use `REDIS_HOST` / `REDIS_PORT` |
| `REDIS_DISABLED=true` | Explicit in-memory mode, reported by readiness |
| `CORS_ALLOWED_ORIGINS` | Comma-separated origins; code also adds local origins in `src/server.ts` |
| `FORCE_INSECURE_SESSION_COOKIES=true` | Exception for a local production build served over HTTP, not an HTTPS deployment |
| `PUBLIC_ASSET_BASE_URL` | Public product-image origin; otherwise derived from the request |
| `JSON_BODY_LIMIT` | JSON request limit, default `5mb`; relevant to base64 image uploads |

### Expired Oracle passwords

For `ORA-28001`, restore access to the existing schema rather than resetting it. The optional driver rotation path uses the current `DB_PASSWORD` and a different `DB_PASSWORD_NEW` when `DB_PASSWORD_ROTATE=true`. After successful rotation, save the replacement in the private connection configuration, remove `DB_PASSWORD_NEW`, and disable rotation. In Compose mode the saved identity is `../.local/database.json`; regenerate Compose configuration afterward. Never publish the old or replacement password in logs or documentation.

## API and implemented contracts

| Route | Purpose |
| --- | --- |
| `POST /graphql` | GraphQL queries and mutations |
| `GET /graphql` | GraphiQL is enabled in the current code, including when `NODE_ENV=production` |
| `GET /health/live` | Confirms the HTTP server responds |
| `GET /health/ready` | Checks access to `PRODUCTS` and Redis; returns 503 when a required dependency is unavailable |
| `GET /products/:id/image` | Public image from an Oracle BLOB; 404 if the product has no image |

- Catalog, categories, CMS, login/registration, profile/password updates, addresses, cart, wishlist, reviews, orders, and payment records.
- `getUserContext` groups user, cart, wishlist, and addresses. `getWishlist` returns `{userId, products}`.
- Cookies and Bearer tokens identify server sessions. Logout and revocation invalidate the token too; a valid JWT signature alone is insufficient without an active session.
- `customerSupport` and protected legacy administrative fields require `SUPPORT`. The full authorization audit is still open, including legacy review mutations.
- `addToCart` applies a quantity delta, including negative values. The resulting quantity is clamped to zero and the row is removed at zero.
- The backend calculates order totals using Oracle prices. Customer checkout consumes ordered cart lines in the same transaction.
- `createPayment` records a **PENDING** payment and reuses a PENDING record for the same order/amount/method on retry. It does not process cards, bank transfers, or actual refunds.
- Addresses belong to profiles; orders do not yet store a shipping-address snapshot. Order-creation idempotency after a lost response remains unimplemented.

Read-only checks:

```bash
curl -sS http://localhost:4000/health/ready
curl -sS http://localhost:4000/graphql -H 'Content-Type: application/json' -d '{"query":"{getProducts(limit:3){id name price}}"}'
```

### Product images

Authorized product operations accept `ProductImageUploadInput` with `filename`, `mimeType`, and `base64Data`. Both raw base64 and full data URLs are supported; `removeImage: true` removes the stored image. `PRODUCTS` holds `IMAGE_FILENAME`, `IMAGE_MIME_TYPE`, `IMAGE_DATA`, and `IMAGE_UPDATED_AT`.

GraphQL `Product` and `CartProduct` expose `image { url filename mimeType updatedAt }`. Use the returned URL instead of assuming an `/uploads` directory. The public image route returns the stored MIME type and `Cache-Control: public, max-age=900, must-revalidate`. `PUBLIC_ASSET_BASE_URL` must be reachable by clients and any Next.js image optimizer fetching those URLs.

## Reviewed real-product catalog

The catalog refresh adds verified model descriptions, EUR VAT-inclusive reference prices and actual product photos for all 45 products while preserving IDs and commerce history. See [catalog maintenance](docs/catalog-refresh.md) for sources, snapshot dates, the standalone plan/download/apply commands, fresh SQL-baseline mapping, private backups and subsequent updates. It never runs during API startup. Product reviews from before a model replacement remain in administrative history and are excluded from the public product page.

## Redis sessions and caches

Backend keys are separate from the public GraphQL proxy caches in Next.js:

| Key | Default lifetime |
| --- | --- |
| `cart:<userId>` | 60 seconds |
| `wishlist:<userId>` | 120 seconds |
| `user-context:<userId>` | 120 seconds |
| CMS list/page keys | 60 seconds; missing-page cache writes use 30 seconds |
| `session:<sessionId>`, `session-user:<userId>` | `SESSION_TTL_SECONDS`, default seven days |
| `impersonate:<ticket>` | `IMPERSONATION_TTL_SECONDS`, default 60 seconds |

Cart/wishlist/address/profile changes invalidate the relevant context caches; CMS writes invalidate their backend entries. Session revocation/logout removes session records. This does not automatically invalidate a public response already cached by a Next.js proxy. See [storefront cache tools](../shopx-frontend/README.md#cache-tools) and [admin cache tools](../admin-portal/README.md#cache-tools).

When Redis fails, in-memory fallback does not mean healthy readiness in Redis mode. Restart the backend after Redis recovers. `REDIS_DISABLED=true` explicitly selects a different mode and is not a substitute for shared sessions.

## Schema and SQL script

Services use 11 tables: `CATEGORIES`, `PRODUCTS`, `USERS`, `ADDRESSES`, `ORDERS`, `ORDER_ITEMS`, `PAYMENTS`, `CART_ITEMS`, `WISHLIST`, `CMS_PAGES`, and `REVIEWS`.

### Add data without resetting the database

The [versioned data installer](docs/data-seeding.md) and [general-store pack](data/general-store-v1.json) belong to this repository and work independently of the parent workspace. The pack adds tech, home and lifestyle products, CMS content, accounts, addresses, carts, wishlists, reviews, orders and pending cash-payment records. It preserves existing rows, saves a private logical snapshot, and records installation in the additional `SHOPX_DATASET_RUNS` table. Reapplying the same version does not duplicate data or reset passwords.

With this repository's Oracle configuration available, preview before applying to the intended schema:

```bash
npm run data:seed
npm run data:seed -- --apply --expect-schema YOUR_SCHEMA
```

Replace `YOUR_SCHEMA` with the configured schema name. Output defaults to Git-excluded `.local/data/`; credentials and snapshots must stay private. Applying is explicit and separate from API startup. In the recovered workspace, the pack increased the catalog from 33 to 45 products and from 11 to 14 categories, while preserving the original data. The guide covers counts, cache refresh, standalone Docker commands, rollback and concurrent-installation tests.

The implemented commerce roles remain `CUSTOMER` and `SUPPORT`. The starter's general administrator and support operator share `SUPPORT` permissions. The separate local control-plane component now creates independent platforms with schema, Redis/session boundaries and private configuration; its global roles are not commerce roles. Generated owners currently receive scoped `SUPPORT` access, not a new fine-grained owner role.

### Destructive reset for disposable schemas

[sql_script.txt](sql_script.txt) is a **destructive reset with demo seed data**, not a migration or backup. It executes `DROP ... CASCADE CONSTRAINTS PURGE`. Do not run it to restart an existing database or fix an empty catalog. For an intentionally disposable schema, SQL*Plus/SQLcl can execute it with `@sql_script.txt`; the isolated test below is the reproducible verification path.

Isolated Oracle 19c verification on October 11, 2026 confirmed two successful runs with 11 categories, 33 products, 16 users, 17 addresses, 23 orders, 41 order items, 23 payments, 15 cart items, 15 wishlist entries, eight CMS pages, and ten reviews. Order/payment totals are consistent. These are seed counts, not the recovered database's inventory, which contains later changes.

Verified SQL corrections:

- `WHENEVER SQLERROR` and `WHENEVER OSERROR` make SQL*Plus exit unsuccessfully. Injected DDL/seed errors return nonzero exit codes; uncommitted DML is rolled back. **Oracle DDL commits implicitly**, so rollback cannot recover dropped tables.
- Resets remove legacy `ORDER_PRODUCTS` before parent tables, preventing leftover rows without foreign keys.
- `CHECK` constraints reject negative prices/totals/amounts, fractional quantities, and ratings outside integer values 1–5. Order-item quantities must be positive.
- Cart quantities are integral and **nonnegative**. Zero is allowed for `CartService.addToCart`, whose `MERGE` sets zero and removes the row in the same statement. Tests execute SQL extracted from that service, including decrements below zero, commit, and confirmation that the row was removed.

These constraints apply to schemas created using the current DDL. Setup in `existing` mode **does not add them to `AREVY`**; the recovered schema and its legacy table were preserved. Updating an existing database requires a separate migration after backup and a data audit, not this reset.

### Reproducible SQL test

From this repository, with a dedicated Oracle 19c test container running, `ORCLPDB1` open, and SQL*Plus OS authentication available:

```bash
SHOPX_SQL_TEST_CONTAINER=your-dedicated-test-container npm run test:sql
```

Replace the placeholder with your running test instance. The earlier `pedantic_archimedes` container was removed after verification and a data audit; the runner does not provision or start containers. Do not use the recovered application database as the test instance. The [integration runner](tests/sql-bootstrap.integration.cjs) requires an explicit container, generates its own `SX_TEST_*` user, tests only that schema, and removes it even after failures. It does not read `.env`, `.local/database.json`, or application credentials. It requires Node and Docker CLI; SQL*Plus runs inside the container.

On October 11, 2026, **nine integration scenarios** passed (ten Node tests including the parent): seed, repeat reset with a legacy table, consistency, invalid values, valid boundaries, actual cart SQL, DDL failure, schema-only bootstrap, and seed failure/rollback. They are separate from `npm test`, which does not require Oracle/Docker.

`../scripts/seed-oracle.sh` is a legacy helper for the retired Oracle XE `XEPDB1` service. Current Compose neither uses it nor defines that Oracle service. The [workspace guide](../README.md) explains the environments.

## Commands and verification

| Command, from this repository | Purpose |
| --- | --- |
| `npm run dev` | Hot-reloading server through `ts-node-dev` |
| `npm run build` | Compile TypeScript into `dist/` |
| `npm start` | Run `dist/index.js`; requires a previous build |
| `npx tsc --noEmit` | TypeScript check without emitting a build |
| `npm test` | 20 regression tests: sessions, authorization, startup, datasets, catalog/image validation, review visibility and managed-platform isolation |
| `SHOPX_SQL_TEST_CONTAINER=<test-container> npm run test:sql` | Nine real Oracle scenarios in a temporary schema, separate from application data |
| `npm run data:seed` | Read-only plan for the versioned starter pack; add `-- --apply --expect-schema YOUR_SCHEMA` to install explicitly |
| `SHOPX_DATA_TEST_CONTAINER=<test-container> npm run test:data` | Five real Oracle scenarios for additive installation, preservation, reruns, rollback and concurrency |
| `npm run lint` | Currently fails: ESLint 9 expects `eslint.config.*`, while this repository has `.eslintrc.json` |
| `npm run format` | Rewrites files with Prettier; not a read-only check |

The 20 unit tests passed on October 12, 2026; seven additive-data/catalog Oracle scenarios passed during the earlier catalog milestone. Lint remains blocked as described above. Unit tests use service test doubles; the separate Oracle suites exercise actual SQL in temporary schemas. Workspace `../scripts/smoke.mjs` also passed against recovered `AREVY`, covering registration, sessions, cart/wishlist/address changes, server-priced checkout, pending-payment retry, ownership and logout, then removing its QA records. `../scripts/verify-data.mjs` verified all four starter accounts through the direct API and three client proxies. See the [workspace verification record](../docs/development-status.md) for browser/native evidence and remaining limits.

## Logging and shutdown

[logger.ts](src/utils/logger.ts) uses Winston with timestamped, colored console messages; the current format is not structured JSON. Request logging is configured in [server.ts](src/server.ts). `SIGINT` and `SIGTERM` close the Oracle pool and Redis connection before exit. The code does not implement HTTP request draining, so do not assume every in-flight request completes during shutdown.

## Code, documentation, and Docker

- [GraphQL schema](src/graphql/schema.ts), [resolvers](src/graphql/resolvers), [services](src/services), and [configuration](src/config).
- [GraphQL operations](docs/graphql-operations.md): examples, authorization boundaries, and manual verification guidance. Example IDs are not universal account/product identifiers.
- [Backend backlog](docs/backend-backlog.md) and [workspace status](../docs/development-status.md): remaining work and verification limits.

The Dockerfile uses Node 22 bookworm-slim. Compose selects `development`, waits for Oracle/Redis, then runs `yarn dev`; the `production` target compiles TypeScript and runs `node dist/index.js`. Private Compose configuration stays in `../.local/compose.env`, outside the image. Existing Oracle is attached through an external network and is not recreated by Compose. Production images were also built and exercised by the October 12 local-factory integration checks described below.

## Managed platform instances

The optional platform-factory integration keeps the standalone backend contract intact. Without `PLATFORM_ID`, the existing Oracle/Redis and image behavior remains unchanged.

A managed instance sets `PLATFORM_ID=sx_<12 hex characters>`, its own `DB_USER`, `DB_CONNECT_STRING`, Redis endpoint, JWT secret and explicit `CORS_ALLOWED_ORIGINS`. `DB_PASSWORD_FILE`, `JWT_SECRET_FILE` and `REDIS_URL_FILE` read private files instead of embedding their values in deployment manifests. Managed startup validates its persisted platform identity before serving traffic; managed sessions fail closed if Redis is unavailable. JWTs also carry the platform issuer/audience.

- `GET /platform-config` exposes only the validated public configuration, or `configuration: null` for standalone instances. It never exposes credentials.
- `GET /health/ready` includes the platform ID/config revision for managed instances.
- `PUBLIC_ASSET_RELATIVE=true` returns same-origin `/api/products/:id/image` URLs. Both this path and the existing `/products/:id/image` endpoint serve product images.
- `npm run platform:provision` is the private worker's installer, using `PLATFORM_SETUP_FILE`, `PLATFORM_ASSETS_DIR` and `DB_CONNECT_STRING`. It only accepts generated `SX_P_<12 hex>` schemas in the expected application PDB. Do not point the reset script at a managed or existing business schema.
- `migrations/001-commerce.sql` is an empty-schema baseline; `SHOPX_PLATFORM_INSTALL` stores ownership, checksum and DDL checkpoints. Unknown existing tables or a changed baseline cause failure. It never drops data.
- `data/general-store-real-v1.json` contains 45 reviewed real products and CMS content, with empty customer/order/account collections. The installer creates one new store owner with the existing scoped `SUPPORT` role and privately generated credentials.
- Provisioning accepts `seedMode: "empty"` to skip catalog/CMS installation, or `"demo"` (the backward-compatible default) to install that content pack. Both create a fresh owner without copying existing users or transactions. `SHOPX_PLATFORM_CONTENT` records the selected mode before seeding; retry cannot switch a partial or established installation to another content mode. Intentionally empty catalogs are valid running platforms.

The backend repository can still be built and deployed alone. The factory consumes its production image and installer; no control-plane source is imported. Production hosting additionally requires durable Oracle storage, backups/restore verification and HTTPS. The local factory's HTTP-cookie override must not be used on public deployments.
