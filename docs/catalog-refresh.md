# Real-product catalog maintenance

The [October 12, 2026 manifest](../data/catalog-eu-2026-10-12.json) replaces 45 demonstration products across the existing 14 categories with real models. Every entry has an exact variant, factual description, EUR price, reference page, verification date, market and a SHA-256-locked product photograph. Sources include Apple Ireland, IKEA Ireland, Eason, Elverys, Meaghers, Evergreen, Cogs Toys & Games, Halfords Ireland, Logitech, Anker and Soundcore.

Prices are **VAT-inclusive retail reference prices checked on October 12, 2026**, primarily in Ireland, with EU regional prices for the remaining sources. Shipping is excluded. This is a reviewed snapshot, not a live stock or pricing feed. VAT and offers can differ between EU countries. Source availability metadata does not implement ShopX inventory.

## Ownership and storage

This repository owns the manifest, installer and tests. It works with the configured Oracle connection without sibling repositories. Clients consume the existing `getProducts` / `getProduct` contracts and `/products/:id/image` endpoint. Runtime does not depend on the supplier image hosts.

The importer updates `PRODUCTS.NAME`, `DESCRIPTION`, `PRICE` and image columns in place. Product IDs, category IDs, accounts, addresses, carts, wishlists, orders, line prices and payments remain unchanged. Existing carts use the refreshed catalog prices; completed order line amounts are not rewritten or converted. The current schema has no per-order currency field, so the UI's EUR convention does not retroactively establish the currency of historical records.

Images are stored as Oracle BLOBs. The current pack contains 45 distinct JPEG/PNG files totaling approximately 7.30 MiB. Asset files are cached privately by SHA-256; image URLs, MIME types, byte sizes and original source references remain in the manifest. Source images retain their respective owners' rights.

Two optional metadata tables are created only by explicit application:

- `SHOPX_CATALOG_RUNS`: immutable version ID, manifest checksum and application date.
- `SHOPX_CATALOG_SOURCES`: current product/source metadata and last model replacement date.

Public `getReviews(productId)` excludes feedback predating a model replacement, so old demonstration reviews are not presented as reviews of the real model. Administrative history remains available. A price-only refresh with `legacyName === name` retains the cutoff. Schemas without these metadata tables keep their existing review behavior.

## Plan, download and apply

Use Node 22 and installed dependencies. Configure `DB_USER`, `DB_PASSWORD` and `DB_CONNECT_STRING` privately in the environment or `.env`. From this repository:

```bash
npm run data:catalog
npm run data:catalog -- --download
npm run data:catalog -- --apply --expect-schema YOUR_SCHEMA
```

The first command only resolves exact existing names/categories and reports the plan. `--download` retrieves and validates the reviewed images before reporting that plan. Neither changes Oracle data. `--apply` requires the schema name to match and all validated image files to exist. It writes a private product snapshot before changing the catalog. Defaults are `.local/catalog/` and `.local/catalog/assets/`, excluded from Git. Use `--output-dir` and `--assets` to choose other private directories.

The manifest targets the recovered ShopX catalog plus the previously installed `general-store-v1` pack. It is not an empty-database seed. An unknown, missing, duplicated or recategorized legacy product causes a failure before product updates. Do not run the destructive SQL reset against an existing store to make its names match.

For another catalog, copy the manifest, give it a **new version ID**, review each `legacyName`, and use:

```bash
npm run data:catalog -- --catalog .local/my-catalog.json --download
npm run data:catalog -- --catalog .local/my-catalog.json --apply --expect-schema YOUR_SCHEMA
```

### Fresh disposable SQL baseline

The SQL demo seed calls its laptop `Laptop Pro 15`; the recovered database had renamed it `MacBook PRO 15`. All other mappings match the SQL seed plus `general-store-v1`. After explicitly preparing that disposable baseline and applying the additive pack, create a separate manifest rather than editing the recovered version:

```bash
mkdir -p .local/catalog
node -e 'const fs=require("node:fs");const c=JSON.parse(fs.readFileSync("data/catalog-eu-2026-10-12.json"));c.id="eu-real-catalog-sql-2026-10-12";c.products.find(p=>p.legacyName==="MacBook PRO 15").legacyName="Laptop Pro 15";fs.writeFileSync(".local/catalog/sql-baseline.json",JSON.stringify(c,null,2)+"\n")'
npm run data:catalog -- --catalog .local/catalog/sql-baseline.json --download
npm run data:catalog -- --catalog .local/catalog/sql-baseline.json --apply --expect-schema YOUR_SCHEMA
```

For any other starting catalog, review the complete mapping yourself. Never infer a match from price, category alone or an assumed numeric ID.

## Subsequent updates and failure handling

An already applied version is a no-op. Editing its content is rejected. For another price/model/image review, create a new manifest ID and use the current product name as `legacyName`. Recheck the exact SKU, price, gross-price basis and date. Review any changed photograph and its digest before application; the downloader deliberately rejects upstream bytes that no longer match the reviewed image.

Application locks `PRODUCTS` briefly, repeats target validation and writes all products and source metadata in one transaction. It verifies business-row preservation before committing. Oracle DDL commits implicitly, so metadata table creation happens first; a later failure may leave empty metadata tables, but product changes and the version claim roll back together. Run during a quiet maintenance window because concurrent business writes can cause preservation verification to fail safely.

The private `<catalog-id>-before-<timestamp>.json` contains the previous product values, including images. It is a targeted recovery artifact, not a full database backup or an automatic undo command. Do not publish it. A reviewed restore must account for product edits made since application and the source/version metadata.

After a standalone import, refresh the known public catalog caches in each connected client service using its documented cache controls. Preserve sessions and private data; do not flush all Redis databases. The optional parent-workspace `scripts/catalog.mjs` adapter performs this scoped refresh and uses the existing saved local Oracle configuration.

## Verification

```bash
npm test
SHOPX_DATA_TEST_CONTAINER=oracle19 npm run test:data
```

Unit tests cover manifest validation, rejected HTML masquerading as images and review visibility. Oracle integration tests create and remove their own random schema in `ORCLPDB1`, checking schema guards, a late SQL failure/rollback, unchanged business history, image persistence, replay protection and review-cutoff preservation on price-only updates. They do not reset the application's schema.

The local application was also checked through GraphQL: all 45 names, categories, descriptions, prices and image bytes matched the manifest, and Chrome decoded every image. The standalone downloader also fetched all 45 into an empty temporary directory and verified their locked digests. Those checks validate this snapshot; they do not establish future supplier prices or stock.
