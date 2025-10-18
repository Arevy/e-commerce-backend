# E-commerce Backend

Backend GraphQL service for a store front + admin e-commerce experience. It runs on
Express, connects to Oracle Database for persistence, and optionally uses Redis
(or a built-in memory fallback) for caching hot reads.

- Supports catalog, cart, checkout, payments, wishlists, reviews, and address
  management flows required by both customer and admin surfaces.
- Session-based authentication with secure HTTP-only cookies (`sid`) and
  Redis-backed session storage that now powers the store front and admin portal.
- Exposes a `getUserContext` aggregate that hydrates cart, wishlist, addresses,
  and identity details in one call for the store front and support tools.
- Dedicated `customerSupport` GraphQL namespace so support agents can audit and
  mutate every domain object without switching schemas.
- Native product image storage with an Oracle BLOB column, upload mutations, and
  a streaming `/products/:id/image` endpoint so both storefront and admin UIs keep
  previews in sync.
- Ships with SQL bootstrap + seed data so every resolver can be exercised out of
  the box.
- JWT-based authentication with sample test accounts for quick manual testing.

## Technology Stack
- **TypeScript + Node.js 22 LTS** for a strongly typed developer experience.
- **Express.js** with `express-graphql` to expose the GraphQL endpoint.
- **Oracle Database 19c** (or compatible) as the relational store.
- **Redis 6+** for caching (falls back to in-memory cache when unavailable).
- **Winston** for structured logging and `jsonwebtoken` for JWT issuance.

## Requirements
- Node.js 22.11.0 (LTS) or newer 22.x release
- Yarn 1.22+

## Node Version Management
- An `.nvmrc` file pins the runtime to Node.js 22.11.0. Run `nvm use` (or your
  tool of choice) to automatically select the correct version.
- After switching Node major versions, reinstall native dependencies to rebuild
  prebuilt binaries: `rm -rf node_modules && yarn install`.
- The `yarn build` script remains the quickest sanity check once the upgrade is
  complete.
- Oracle Database 19c (reachable from the API process)
- Redis 6+ (optional but recommended)

## Environment Variables
Copy `.env.example` (create it if missing) to `.env` and adjust values. All keys
are consumed via `src/config`.

```dotenv
# Oracle connection
DB_USER=your_oracle_username
DB_PASSWORD=your_oracle_password
DB_PASSWORD_NEW= # optional: supply when rotating an expired password
DB_PASSWORD_ROTATE=false # set to true to let the API rotate an expired password
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3100
DB_CONNECT_STRING=oracle:1521/XEPDB1
DB_POOL_MIN=1
DB_POOL_MAX=4
DB_POOL_INCREMENT=1

# Session management
SESSION_COOKIE_NAME=sid
SUPPORT_SESSION_COOKIE_NAME=support_sid
SESSION_TTL_SECONDS=604800
IMPERSONATION_TTL_SECONDS=60
# Uncomment to allow http://localhost cookies while running `next start`
# FORCE_INSECURE_SESSION_COOKIES=true

- `SESSION_COOKIE_NAME` — Shopper session cookie. Defaults to `sid`.
- `SUPPORT_SESSION_COOKIE_NAME` — Dedicated cookie for support/admin sessions (prevents clashes with shopper cookies). Defaults to `support_sid`.
- `SESSION_TTL_SECONDS` — TTL for sessions (in seconds). Defaults to 7 days.
- `IMPERSONATION_TTL_SECONDS` — TTL for impersonation tickets (in seconds). Defaults to 60 seconds.
- `FORCE_INSECURE_SESSION_COOKIES` — Set to `true` to drop the `Secure` flag on session cookies. Handy when running the production build locally over HTTP.

# Auth
JWT_SECRET=replace_me_with_a_real_secret

# Redis connection (optional)
REDIS_URL=redis://localhost:6379
# or individually
# REDIS_HOST=127.0.0.1
# REDIS_PORT=6379
# Set to "true" to force the in-memory cache
REDIS_DISABLED=false

# App
PORT=4000
PUBLIC_ASSET_BASE_URL=http://localhost:4000
JSON_BODY_LIMIT=5mb
```

- `PUBLIC_ASSET_BASE_URL` — Optional absolute origin used when building product
  image URLs. When omitted, the server derives the base URL from the incoming
  request.
- `JSON_BODY_LIMIT` — Maximum body size accepted by `express.json()`. Increase
  this when sending larger base64-encoded images. Defaults to `5mb`.

## Oracle Setup

### Local container (recommended)
1. Launch the bundled database: `docker compose up -d oracle`.
2. Wait for the container to report healthy (`docker compose ps`).
3. Seed the schema with `./scripts/seed-oracle.sh` from the repository root. The
   script pipes `sql_script.txt` into `sqlplus`, rebuilding the schema and
   sample data end-to-end. It automatically reuses `DB_USER` / `DB_PASSWORD`
   from `e-commerce-backend/.env` (or you can override via `ORACLE_APP_USER`
   / `ORACLE_APP_PASSWORD`).
   The refreshed seed now provisions 11 categories, 30+ products, a dozen
   customer accounts, and more than 20 historical orders so dashboards,
   support tooling, and impersonation flows have realistic volume out of the
   box.

The container uses `gvenzl/oracle-xe:21-full`, exposes port `1521`, and sets the
SYS password to `Password` by default (override via `ORACLE_SYS_PASSWORD`).
Application credentials inherit `ORACLE_USER` / `ORACLE_PASSWORD` (`shopx` /
`shopx` by default).

### External instance
1. Ensure an Oracle instance is running and reachable from the backend
   container.
2. Update `DB_CONNECT_STRING`, `DB_USER`, and `DB_PASSWORD` (or their `ORACLE_*`
   counterparts) to match the target.
3. Connect as the application user and run `sql_script.txt` to recreate the
   schema and seed data as shown below:

   ```sql
   @sql_script.txt
   ```

   The script first drops existing tables owned by the user (safe to re-run
   when you need a clean slate), then builds every table used by the resolvers
   and populates sample data.

### Handling Expired Oracle Passwords
- When Oracle forces a password rotation, first set `DB_PASSWORD` to the current
  (expired) credential and `DB_PASSWORD_NEW` to the **new, different** password that
  should replace it (Oracle rejects reusing the same value). Enable automated
  rotation by setting `DB_PASSWORD_ROTATE=true`.
    - The next server boot will detect the `ORA-28001` error, change the password
  via Oracle's thin driver, and switch the connection pool to the new
  credential.
- Update your secrets storage (`.env`, vault, CI variables) so that subsequent
  deployments use the new value and remove `DB_PASSWORD_NEW` after a successful
  rotation.

### Default Test Accounts
| Email               | Password       | Notes                       |
|---------------------|----------------|-----------------------------|
| `alice@example.com`   | `Password123!` | Customer with existing data |
| `bob@example.com`     | `Password123!` | Secondary customer          |
| `support@example.com` | `Password123!` | Customer support role       |

Passwords are stored hashed in the seed script and compatible with the `login`
resolver.

## Install & Run
```bash
yarn install
yarn build       # compile TypeScript to dist/

# Development with hot reload
yarn dev         # runs src/index.ts via ts-node-dev

# Production build
yarn start       # executes the compiled dist/index.js
```

GraphQL is available at `http://localhost:${PORT:-4000}/graphql` with GraphiQL
enabled in non-production environments.

## Redis Usage
- The service attempts to connect to Redis on launch. When unreachable or when
  `REDIS_DISABLED=true`, a local memory map takes over caching for carts,
  wishlists, CMS pages, user-context payloads, and sessions.
- Keys follow the pattern `cart:{userId}`, `wishlist:{userId}`,
  `user-context:{userId}`, and `session:{sessionId}` (with `session-user:{userId}`
  for quick lookups). They are invalidated automatically after mutations,
  session revocations, or logout.
- TTL defaults to 60 seconds for carts, 120 seconds for wishlists, and
  `SESSION_TTL_SECONDS` (default 7 days) for authenticated sessions. Adjust the
  respective services if you need tighter or looser caching.

## Database Footprint
The schema provisions:
- `CATEGORIES`, `PRODUCTS`
- `USERS`, `ADDRESSES`
- `ORDERS`, `ORDER_ITEMS`, `PAYMENTS`
- `CART_ITEMS`, `WISHLIST`
- `REVIEWS`
- `CMS_PAGES`

Each table receives seed data aligned with the GraphQL samples documented under
`docs/graphql-operations.md`.

`PRODUCTS` now includes `IMAGE_FILENAME`, `IMAGE_MIME_TYPE`, `IMAGE_DATA`, and
`IMAGE_UPDATED_AT` so catalog assets live alongside the rest of the record.

## Product Images
- Upload or replace an asset through `addProduct` / `updateProduct` (including
  the `customerSupport` namespace) by passing an `image` argument with
  `filename`, `mimeType`, and `base64Data`. The resolver accepts both raw
  base64 strings and full data-URL payloads.
- Remove an existing asset by calling `updateProduct` with `removeImage: true`.
- Fetch the binary via `GET /products/:id/image`; the route streams the stored
  BLOB with the persisted MIME type and cache headers. No authentication is
  required so both storefront and admin clients can display thumbnails.
- GraphQL `Product` and `CartProduct` types expose an `image` object containing
  `url`, `filename`, `mimeType`, and `updatedAt` for rendering and cache busting.

## Exercising the GraphQL API
A comprehensive, domain-by-domain catalogue of queries and mutations (with sample
payloads driven by the seeded data) lives in `docs/graphql-operations.md`. It now
also covers the `customerSupport` root field so agents can trial the dedicated
admin surface without reverse engineering bespoke payloads. Use it as the
definitive playbook when testing store front and admin interactions.

For quick smoke tests you can also issue cURL requests:

```bash
# Add a category
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { addCategory(name: \"Kitchen\", description: \"Appliances\") { id name }}"}'

# Fetch products with filters
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query { getProducts(limit: 5, name: \"Laptop\") { id name price category { name } }}"}'
```

## Logging & Shutdown
- `src/utils/logger.ts` wires Winston for JSON logs.
- Graceful shutdown hooks close the Oracle pool and Redis client on `SIGINT` and
  `SIGTERM` so in-flight work completes cleanly.

## Quality Checklist
1. `yarn build` — ensures the TypeScript project compiles.
2. Exercise critical GraphQL flows via GraphiQL or the cURL snippets above.
3. Toggle `REDIS_DISABLED=true` to validate the in-memory cache fallback.

## Additional Documentation
- `docs/graphql-operations.md` — end-to-end operations catalogue with payloads
  and expected responses.
- `docs/backend-backlog.md` — backlog of remaining production hardening tasks.

## Docker

- The provided multi-stage `Dockerfile` builds a production-ready image, installing `libaio1` and configuring `/opt/oracle/instantclient` so the Instant Client libraries are discoverable at runtime. It keeps `npm_config_oracle_skip_postinstall=1` to bypass the Oracle driver's postinstall script inside CI/build environments.
- When using the monorepo-level `docker-compose.yml`, create an `oracle-client/` directory alongside that file and extract the Oracle Instant Client (Basic or Basic Lite) into it. Compose mounts the folder read-only into `/opt/oracle/instantclient` and publishes a `host.docker.internal` entry so the container can resolve your Oracle host across macOS, Windows, and Linux.
- The compose file provisions Oracle XE (`oracle` service) and Redis alongside the backend. Start the dependencies with `docker compose up -d oracle redis`, then run `./scripts/seed-oracle.sh` before launching the API or frontends.
- Provide `ORACLE_USER`, `ORACLE_PASSWORD`, and (optionally) `ORACLE_CONNECT_STRING` via environment variables or a `.env` file so the API can authenticate against the database. `CORS_ALLOWED_ORIGINS` should include the admin portal (`http://localhost:3000`) and store front (`http://localhost:3100`).
- Build and run the service with `docker compose up --build backend` from the repository root, or `docker compose up --build` to start the entire stack (Oracle, Redis, backend, store front, admin portal).
