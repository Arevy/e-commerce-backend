# E-commerce Backend

Backend GraphQL service for a storefront + admin e-commerce experience. It runs on
Express, connects to Oracle Database for persistence, and optionally uses Redis
(or a built-in memory fallback) for caching hot reads.

- Supports catalog, cart, checkout, payments, wishlists, reviews, and address
  management flows required by both customer and admin surfaces.
- Dedicated `customerSupport` GraphQL namespace so support agents can audit and
  mutate every domain object without switching schemas.
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
DB_CONNECT_STRING=localhost:1521/ORCLCDB
DB_POOL_MIN=1
DB_POOL_MAX=4
DB_POOL_INCREMENT=1

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
```

## Oracle Setup
1. Ensure an Oracle instance (e.g. `ORCLCDB`) is running and reachable.
2. Connect as the application user and run `sql_script.txt` to recreate the
   schema and seed data end-to-end:

   ```sql
   @sql_script.txt
   ```

   The script first drops existing tables owned by the user (so it is safe to
   re-run when you need a clean slate), then builds every table used by the
   resolvers and populates sample categories, products, users, addresses, carts,
   wishlists, reviews, orders, order items, and payments so each GraphQL
   mutation/query can be exercised immediately.

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
  `REDIS_DISABLED=true`, a local memory takes over the role of the cache for the cart, wishlist and now CMS pages.
- Keys are kept by default for 60 seconds and are automatically invalidated after
move operations (including for the CMS service).

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

## Exercising the GraphQL API
A comprehensive, domain-by-domain catalogue of queries and mutations (with sample
payloads driven by the seeded data) lives in `docs/graphql-operations.md`. It now
also covers the `customerSupport` root field so agents can trial the dedicated
admin surface without reverse engineering bespoke payloads. Use it as the
definitive playbook when testing storefront and admin interactions.

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
- Before starting the container, provide `ORACLE_USER`, `ORACLE_PASSWORD`, and (optionally) `ORACLE_CONNECT_STRING` via environment variables or a `.env` file so the API can authenticate against the database. `CORS_ALLOWED_ORIGINS` should include the admin portal (`http://localhost:3000`) and storefront (`http://localhost:3100`).
- Build and run the service with `docker compose up --build backend` from the repository root, or `docker compose up --build` to start the entire stack (Redis, backend, storefront, admin portal).
