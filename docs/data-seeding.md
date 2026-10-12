# Additive starter data

The backend owns the data definition and installer. They work in a standalone clone and do not depend on any sibling repository. The optional [general-store-v1 dataset](../data/general-store-v1.json) is the first starter pack for independent, customizable commerce deployments: technology, home, and lifestyle. Its records are persisted in Oracle and served by the real GraphQL API. Applications do not import this file or fall back to mock responses.

## What the pack adds

| Records | Count | Purpose |
| --- | --- | --- |
| Categories | 3 | Connected Living, Considered Home, Everyday Adventure |
| Products | 12 | Four products in each new category |
| Accounts | 4 | General administrator and support operator (`SUPPORT`); two shoppers (`CUSTOMER`) |
| Addresses | 2 | Fictional addresses belonging only to the new shoppers |
| Cart / wishlist entries | 3 / 4 | Populated account scenarios |
| Orders / order lines / payments | 2 / 4 / 2 | Catalog-priced orders and matching `PENDING` cash payments |
| CMS pages | 4 | Three published pages and one private draft |
| Reviews | 3 | Explicitly labeled demonstration reviews |

No payment is charged. Existing homepage content, accounts, password hashes, orders, and uploaded images are preserved. New products initially use the clients' existing missing-image UI; the installer does not fetch images from third parties. The pack does not change currencies or shipping/payment behavior.

Only `CUSTOMER` and `SUPPORT` exist in the current schema/API. Both administrative sample accounts have the same `SUPPORT` permissions. They do not establish a separate superadministrator, merchant, or platform-owner role. Guests have no database account.

## Run from this repository

Install this repository's dependencies using `yarn install --frozen-lockfile`, then configure the existing Oracle identity in your private `.env` or environment. Do not initialize/reset an existing schema to run this installer.

```bash
# Read-only plan; no accounts or tables are created.
npm run data:seed

# Replace YOUR_SCHEMA with the exact schema name shown by the plan.
npm run data:seed -- --apply --expect-schema YOUR_SCHEMA
```

Optional arguments are `--dataset /path/to/versioned-dataset.json` and `--output-dir /path/to/private-directory`. The default output directory is `.local/data`, excluded from Git and Docker build contexts. `.env` is read by the CLI; environment variables already supplied by the caller take precedence. Normal API startup never invokes this installer.

For standalone Docker development, build the updated development image first. Mount a private output directory so snapshots and credentials survive removal of the one-off container:

```bash
mkdir -p .local/data
docker compose --env-file .env.docker build backend
docker compose --env-file .env.docker run --rm -v "$PWD/.local:/app/.local" backend node scripts/seed-data.cjs
docker compose --env-file .env.docker run --rm -v "$PWD/.local:/app/.local" backend node scripts/seed-data.cjs --apply --expect-schema YOUR_SCHEMA
```

The Oracle connection must already be reachable through the configured external endpoint. These commands do not start or seed another Oracle instance.

In the full workspace, the root adapter reads the saved existing identity instead of the backend `.env`:

```bash
node scripts/data.mjs status
node scripts/data.mjs seed
node scripts/data.mjs seed --apply
node scripts/verify-data.mjs
```

Run those commands from the parent `shopx` directory; they require the backend's host dependencies. They are conveniences owned by the workspace and are not required by the standalone installer. The adapter also writes a private account guide in root `docs/`, updates the local smoke-test account after preserving the old configuration, and invalidates only the known public CMS/GraphQL cache namespaces in the root stack.

## Preservation and repeatability

1. Validate keys, references, roles, quantities, prices, lengths, and CMS statuses before writing application data. Applying requires an explicit matching schema name.
2. Save the existing application rows to a private JSON snapshot, including password hashes and image BLOBs. This is a logical row export for local recovery, **not** a complete Oracle backup, migration, or restore tool.
3. Create `SHOPX_DATASET_RUNS` if it does not exist. This ledger is the only added table; existing business tables and their constraints are unchanged. Oracle commits DDL implicitly, so this happens before the data transaction. A failed first installation may leave the empty ledger table.
4. Claim the dataset ID through the ledger's primary key. Insert new data and its result manifest in one transaction. Concurrent installs of the same version cannot duplicate the pack; only the winning transaction creates its credentials file.
5. Preserve existing rows byte-for-byte in the driver's serialized snapshot representation. A matching category can be reused without changing it; collisions with existing product names, account emails, or CMS slugs fail rather than overwrite them.
6. Calculate order amounts from product prices using integer cents. Create only pending cash-payment records. On an insert/validation error, roll back all new business rows and the ledger claim. Oracle identity sequences can still advance during rolled-back work.
7. On a repeat run, return the original installed IDs without changing records or passwords. This also preserves subsequent user edits. The read-only plan remains read-only after installation. A changed checksum under an existing dataset ID fails: publish a new version for additional data.

Re-running a pack does not restore records intentionally edited/deleted through the application. Keep the original private account file; lost or changed passwords are not recovered or reset by the installer. Workspace account-document generation verifies that its saved credentials still match Oracle before publishing them.

The private files use mode `0600`, with newly created output directories at `0700`. Do not commit snapshots, generated credentials, or the workspace's `docs/local-accounts.private.md`. Passwords are random and only their bcrypt hashes are inserted into Oracle; the tracked dataset contains no passwords.

Direct SQL writes do not automatically invalidate application caches. The standalone installer leaves cache management to the deployment: refresh the backend CMS keys and the relevant Next.js public-cache namespaces, or allow their TTLs to expire. Preserve sessions/private contexts. The root adapter handles its own known namespaces, without `FLUSHDB` or changing other Redis databases. Browser/store state may still require a reload.

## Relationship to the SQL reset

[sql_script.txt](../sql_script.txt) remains the historical, destructive schema/demo reset for disposable environments. Its original seed stays reproducible. It now also drops `SHOPX_DATASET_RUNS` during an intentional full reset, so that a subsequent starter installation cannot mistake deleted records for an applied pack.

Use the additive installer for recovered `AREVY`. Do not run the reset to add these records. A fresh disposable platform can initialize the base schema first, then explicitly apply its selected versioned pack. Neither is an automatic production-startup step.

## Verification

`npm test` includes dataset validation and preservation regression tests. The Oracle integration suite requires a running container supporting SQL*Plus OS authentication and an open `ORCLPDB1`:

```bash
SHOPX_DATA_TEST_CONTAINER=your-test-container npm run test:data
```

The suite creates a randomized `SX_DATA_*` schema in `ORCLPDB1`, uses its own credentials, and drops only that schema afterward. It never reads application `.env`/workspace credentials or switches the reset to `AREVY`. `SHOPX_DATA_TEST_CONNECT_STRING` overrides the test driver's `127.0.0.1:1521/ORCLPDB1` connection.

On October 11, five Oracle scenarios passed: read-only planning/schema guard; full installation and password/amount checks; no-op reruns and checksum protection; rollback after a late constraint failure; and concurrent installation. The recovered database was then populated explicitly and independently verified through all four application GraphQL entry points.
