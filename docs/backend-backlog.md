# Backend backlog

Reviewed against the current source on October 27, 2026. This separates implemented foundations from remaining work; it does not claim production readiness. See the [backend README](../README.md) for setup and the workspace verification record (`../../docs/development-status.md`, integration workspace only) for the environments actually tested.

## Implemented foundations

| Area previously listed as missing | Current state | Remaining work |
| --- | --- | --- |
| Sessions and revocation | Redis-backed sessions, separate customer/support cookies, session-bound Bearer tokens, forced logout, and impersonation tickets | Device/session listing API, rotation/refresh policy, recovery, audit, and throttling |
| Product images | Oracle BLOB fields, image upload/removal, and public image URLs | SKU, inventory, richer attributes/media, and publishing workflow |
| Trusted order prices | Customer orders use Oracle prices and validate positive integral quantities; ordered cart lines are consumed transactionally | Stock checks, price-change UX, taxes, shipping, discounts, and order-creation idempotency |
| Customer account | Profile update, password change, addresses, and order-history query exist | Account recovery/deletion workflows, invoices, preferences, and broader flow coverage |
| Support order queries | `customerSupport.orders`, `ordersConnection`, and `order` provide listing/filtering/pagination | Fulfillment model, richer status history, returns, and notifications |
| Dependency health | `/health/live` and `/health/ready`, Oracle/Redis readiness, structured operational logs and optional control-plane monitoring | HTTP request draining, distributed tracing and broader recovery behavior |
| Automated tests | Session/authorization regression tests and a separate Oracle SQL integration runner exist | Broader service/resolver, security, concurrency, and CI coverage |
| SQL reset and local orchestration | Reset script has fail-fast behavior, legacy-table cleanup, constraints, and nine isolated test scenarios; Compose connects existing Oracle | Nondestructive migrations, backups/external volumes, and production-image verification |
| Versioned starter data | Additive installer, real-product catalog/photos, content-only factory demos and Oracle preservation/rollback tests | More verticals, scheduled data updates and broader recovery tooling |

## Independent platform generation

- The independent [control plane](https://github.com/Arevy/shopx-control-plane) now owns the versioned manifest, creation preview, dedicated Compose stacks, invitation-only roles and revision-guarded configuration publication. The backend exposes the public configuration contract; it does not provision other businesses itself.
- Managed platforms use separate Oracle schemas, Redis instances/volumes, credentials and gateway hostnames. Startup checks reject mismatched managed schema identities and privileged database sessions. The original standalone schema remains separate and is not automatically adopted or migrated.
- Storefront, admin and RN display EUR with VAT-inclusive catalog reference prices. Existing transaction amounts were not converted or assigned a proven historical currency by changing their display symbol.
- Remaining work includes customer-domain/TLS automation, a general release-upgrade UI, tested backup/restore, nondestructive schema evolution, legacy-store adoption and native/desktop distribution. Root Compose is optional integration tooling, not a source dependency of this repository.
- Commerce roles remain `CUSTOMER` and `SUPPORT`; management roles in the control registry do not add granular store-staff permissions.

## Security and identity

- Complete authorization review across all resolvers, especially legacy review mutations and explicit status filters on the public CMS listing. Administrative guards already cover protected top-level fields and the SUPPORT namespace; that is not a complete security audit.
- Expand session management with user-visible device/session listings and an explicit rotation/refresh-token policy. Keep any new tokens tied to server-side revocation in [sessionService.ts](../src/services/sessionService.ts).
- Add password reset, email verification, account recovery, login attempt throttling, and authentication audit events.
- Extend roles beyond `CUSTOMER` / `SUPPORT` with scoped merchandising/marketing permissions. Reassess GraphiQL exposure for production.

## Catalog and product experience

- Add inventory, SKU, and product attributes; image storage is already present in [sql_script.txt](../sql_script.txt) and [productService.ts](../src/services/productService.ts).
- Add price/availability/tag facets and pagination metadata to product queries.
- Support product drafts, publication flags, and scheduling so updates can be staged.
- Add bulk import/export and version history for products/categories.

## Cart and checkout

- Preserve server-derived prices and transaction boundaries in [orderService.ts](../src/services/orderService.ts); add inventory/availability validation and quantity limits where needed.
- Audit product-existence handling and error behavior across cart/wishlist operations, including concurrent changes. Negative cart deltas are supported and tested; a dedicated quantity-update mutation is not required merely to decrement.
- Store shipping/billing address snapshots and shipping-method selections on orders. Profile addresses alone are insufficient.
- Calculate taxes, delivery charges, discounts, and promotions on the server.
- Add order-creation idempotency when a response is lost; reusing a known order during payment retry does not cover this failure case.

## Payments and financials

- Integrate real payment providers and authenticated webhook processing. [paymentService.ts](../src/services/paymentService.ts) currently records payment state without charging customers.
- Store provider transaction references and billing details; define the lifecycle of multiple attempts. Matching PENDING retries already reuse the existing record.
- Implement refunds, voids, and reconciliation. Manually setting a payment status does not execute a financial operation.

## Order management and fulfillment

- Extend existing support listing/filtering with shipments, tracking numbers, carriers, and status history.
- Add returns, exchanges, and cancellations with inventory/payment adjustments.
- Emit domain events or notifications for order-status changes.

## Customer accounts and engagement

- Add account deletion/recovery around existing profile/password operations in [userService.ts](../src/services/userService.ts).
- Store preferences, communication consent, and saved payment methods where supported by a real provider.
- Extend existing customer order history with invoices and downloadable documents.

## Admin tools and data governance

- Record catalog, pricing, user, and order changes in an audit log.
- Provide role-scoped analytics endpoints where needed; current dashboard aggregation is not a full sales/inventory reporting service.
- Implement data export and deletion workflows for privacy requests, with appropriate retention rules.

## Observability and reliability

- Structured request logging is implemented in [server.ts](../src/server.ts); the optional control-plane stack adds sanitized logs, resource/readiness metrics and local alert rules. Remaining work includes distributed tracing, external alert delivery and controlled client telemetry.
- Improve centralized error handling and alerts for Oracle/Redis failures. Readiness reports Redis outages; recovery currently requires restarting the backend.
- Implement HTTP request draining during shutdown in addition to closing Oracle/Redis connections.

## Performance and infrastructure

- Evaluate backend catalog/detail caching beyond the existing cart/wishlist/context/CMS caches. Keep it distinct from public Next.js proxy caches and define invalidation across them.
- Add background jobs for cart expiration, email notifications, reports, and any scheduled publication workflow.
- Create versioned, nondestructive database migrations. The corrected reset script is for disposable schemas and has not migrated recovered `AREVY`.
- Back up Oracle and plan migration to external data volumes without replacing recovered data. Current Compose intentionally reuses `oracle19`.

## Quality and testing

- Extend unit/integration coverage for services, resolvers, ownership, failed mutations, and concurrent checkout/payment behavior.
- Fix ESLint 9 configuration and wire lint, TypeScript, build, and GraphQL contract checks into CI.
- Retain the isolated SQL bootstrap suite; use temporary schemas and explicit test containers rather than resetting the application schema.
- Add controlled load tests and representative fixtures in dedicated test environments. Fixtures must not become runtime mock responses or overwrite recovered data.
