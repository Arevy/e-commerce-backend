# Backend Backlog

This document tracks the outstanding work required to cover customer- and admin-side
functional needs for the e-commerce backend.

## Security & Identity
- Expand session management beyond single-factor login: support device/session listings, rotation, and optional refresh tokens tied to the Redis store (`src/services/sessionService.ts`).
- Extend role-based access control so merchandising/marketing roles have tailored scopes beyond the current customer/support split (`src/graphql/schema.ts:164`).
- Add password reset, email verification, and account recovery flows to harden authentication (`src/services/userService.ts:36`).
- Provide auditing and login attempt throttling to mitigate brute-force attacks (`src/services/userService.ts:42`).

## Catalog & Product Experience
- Extend products with inventory, SKU, media, and attribute data; the current table lacks stock, SKU, and image fields (`sql_script.txt:12`).
- Add search facets (price range, availability, tags) and pagination metadata to product queries (`src/services/productService.ts:21`).
- Support draft/published flags and scheduling for merchandise so the admin can stage updates (`src/graphql/schema.ts:6`).
- Implement bulk import/export and versioning for products and categories for large catalogs (`src/services/productService.ts:90`).

## Cart & Checkout
- Validate product prices and availability during order creation instead of trusting client-sent values (`src/services/orderService.ts:77`).
- Enforce quantity limits, stock checks, and product existence when adding to cart/wishlist (`src/services/cartService.ts:60`, `src/services/wishlistService.ts:47`).
- Capture shipping/billing addresses and shipping method selections as part of checkout (`sql_script.txt:44` lacks these fields on `ORDERS`).
- Calculate taxes, shipping costs, discounts, and promotions server-side to prevent tampering (`src/services/orderService.ts:77`).

## Payments & Financials
- Integrate with real payment providers and handle asynchronous webhook updates; the current service only records manual statuses (`src/services/paymentService.ts:25`).
- Store transaction references, billing details, and support multiple payment attempts per order (`sql_script.txt:107`).
- Implement refunds, voids, and reconciliation processes for admins (`src/services/paymentService.ts:58`).

## Order Management & Fulfillment
- Provide admin-side queries to list and filter orders across all customers (`src/graphql/resolvers/orderResolver.ts:10`).
- Model shipping/fulfillment entities (shipments, tracking numbers, carriers, status history) absent from the schema (`sql_script.txt:44`).
- Support returns, exchanges, and order cancellations with inventory rollbacks and payment adjustments (`src/services/orderService.ts:133`).
- Emit domain events or notifications when order status changes for customer updates (`src/services/orderService.ts:137`).

## Customer Account & Engagement
- Add profile update, password change, and account deletion mutations missing from the schema (`src/graphql/schema.ts:187`).
- Track user preferences, communication consents, and saved payment methods for faster checkout (`sql_script.txt:24`).
- Provide order history, invoices, and downloadable documents for customers via dedicated queries (`src/graphql/schema.ts:151`).

## Admin Tools & Compliance
- Implement moderation/audit logs for catalog, price, and order changes to satisfy compliance needs (`src/services/productService.ts:90`).
- Add role-scoped analytics endpoints (sales, inventory, customer metrics) for the admin dashboard (`src/server.ts:31`).
- Ensure GDPR/CCPA workflows (data export, right-to-be-forgotten) are automated (`src/services/userService.ts:36`).

## Observability & Reliability
- Add structured request logging, metrics, and tracing beyond the basic per-request log middleware (`src/server.ts:23`).
- Implement centralized error handling and alerting for failed DB/Redis calls (`src/config/redis.ts:55`).
- Provide health, readiness, and dependency status endpoints for deployment orchestration (`src/server.ts:62`).

## Performance & Infrastructure
- Add caching/invalidations for catalog queries and product detail pages beyond
  the existing cart / wishlist / user-context caches (`src/services/productService.ts:21`).
- Implement background jobs for tasks such as cart expiration, email notifications, and report generation (`src/server.ts:31`).
- Provide database migrations and seeding tooling to evolve the schema safely (`sql_script.txt:1`).

## Quality & Testing
- Introduce automated unit/integration tests for services and resolvers (currently absent from `package.json:7`).
- Configure linting, type checking in CI/CD, and contract tests for the GraphQL schema (`package.json:6`).
- Seed realistic fixtures and load tests to validate performance under peak traffic (`sql_script.txt:118`).
