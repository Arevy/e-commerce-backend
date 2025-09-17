# E-commerce Backend

Backend GraphQL service for a storefront + admin e-commerce experience. It runs on
Express, connects to Oracle Database for persistence, and optionally uses Redis
(or a built-in memory fallback) for caching hot reads.

- Supports catalog, cart, checkout, payments, wishlists, reviews, and address
  management flows required by both customer and admin surfaces.
- Ships with SQL bootstrap + seed data so every resolver can be exercised out of
  the box.
- JWT-based authentication with sample test accounts for quick manual testing.

## Technology Stack
- **TypeScript + Node.js 18** for a strongly typed developer experience.
- **Express.js** with `express-graphql` to expose the GraphQL endpoint.
- **Oracle Database 19c** (or compatible) as the relational store.
- **Redis 6+** for caching (falls back to in-memory cache when unavailable).
- **Winston** for structured logging and `jsonwebtoken` for JWT issuance.

## Requirements
- Node.js 18+
- Yarn 1.22+
- Oracle Database 19c (reachable from the API process)
- Redis 6+ (optional but recommended)

## Environment Variables
Copy `.env.example` (create it if missing) to `.env` and adjust values. All keys
are consumed via `src/config`.

```dotenv
# Oracle connection
DB_USER=your_oracle_username
DB_PASSWORD=your_oracle_password
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

### Default Test Accounts
| Email               | Password       | Notes                       |
|---------------------|----------------|-----------------------------|
| `alice@example.com` | `Password123!` | Customer with existing data |
| `bob@example.com`   | `Password123!` | Secondary customer          |

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
  `REDIS_DISABLED=true`, a scoped in-memory cache is used for cart and wishlist
  reads.
- Cache keys live for 60 seconds and are evicted whenever mutating operations on
  the same resource complete.

## Database Footprint
The schema provisions:
- `CATEGORIES`, `PRODUCTS`
- `USERS`, `ADDRESSES`
- `ORDERS`, `ORDER_ITEMS`, `PAYMENTS`
- `CART_ITEMS`, `WISHLIST`
- `REVIEWS`

Each table receives seed data aligned with the GraphQL samples documented under
`docs/graphql-operations.md`.

## Exercising the GraphQL API
A comprehensive, domain-by-domain catalogue of queries and mutations (with sample
payloads driven by the seeded data) lives in `docs/graphql-operations.md`. Use it
as the definitive playbook when testing storefront and admin interactions.

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
