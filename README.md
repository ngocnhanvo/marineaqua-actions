# Marine Aqua Actions — WordPress-controlled deployment and read-only tests

Repository: `ngocnhanvo/marineaqua-actions` (branch `main`).

## Source of truth and branches

- Astro development/testing: `ngocnhanvo/marineaqua-astro` → `github`.
- Astro production source: `ngocnhanvo/marineaqua-astro` → `master`.
- WordPress/PHP: `ngocnhanvo/marineaqua-php` → `master`.
- Shared Chromium testing: `ngocnhanvo/knowledge-actions` (reusable workflow, no copying tests).
- See `ngocnhanvo/knowledge` → `main` for the shared engineering rules.

## Build Website

Only the WordPress admin **Build Website** control dispatches `wp_trigger_build` to
`.github/workflows/marineaqua-production-deploy.yml`. The workflow checks out Astro
`master`, validates `WC_URL` and `WC_URL_CLIENT` from `ENV_FILE`, builds the
production source, packages the public Astro assets, and activates the archive
through the signed `marineaqua-unzip.php` endpoint. No site domain, FTP target,
WordPress database name, or Google OAuth credential is hardcoded.

WordPress must configure `VCS_GH_OWNER` and `VCS_GH_REPO` in its own
`wp-config.php`. The MU plugin must not silently override the destination.
The unzip endpoint retains HMAC authentication, timestamp validation, ZIP SHA-256
verification and destination path checks.

## Incremental FTPS transport

The workflow reads the signed PHP inventory before packaging. Unchanged public
images and eligible client HTML/CSS/JS/JSON are omitted only when both their size
and SHA-256 match. The PHP activator restores and verifies them in staging before
the existing activation/rollback. Server output, the new client index and SEO
metadata retain their existing release rules.

Older PHP without inventory support falls back to the full ZIP. Authentication,
destination and checksum errors still fail closed. Deploy `marineaqua-image-delta.php`
before `marineaqua-unzip.php` using the manual PHP release before expecting delta
savings. The resumable FTPS client uses a 4 MiB socket buffer; lftp preparation
overlaps Astro build and must succeed before upload.

`marineaqua-deploy-contract-ci.yml` runs offline Python/PHP contracts and a real ZIP
reconstruction test. It never uploads FTP files or builds Astro.

## CMS automation write scope

For any future project-specific workflow that writes WordPress/CMS, keep the write set smaller than the QA set: only records that actually changed may be saved. Do not touch unrelated Pages/Posts to manufacture build logs or pending counts, and do not create draft/test records merely to obtain a nonce or trigger a build.

If a temporary CMS record is genuinely required, tag it with the project plus GitHub run ID, record its ID immediately, clean it in a `finally` path even when QA/build fails, and verify that zero tagged records remain. A cleanup failure is a failed job, not a PASS. Prefer existing published data or local fixtures whenever possible.

Source-gate requests should also be built from the exact fetched target HEAD and preflighted before `request.ready` is created, so malformed patches do not consume a runner merely to fail `git apply --check`.

## Separate operations

- `marineaqua-shared-playwright.yml`: manual, read-only `smoke`,
  `wordpress-site-health` or `wordpress-build-trigger-audit`. It derives both
  origins from `ENV_FILE`; WordPress checks require `WP_ADMIN_USERNAME` and
  `WP_ADMIN_PASSWORD`. To compare DB identities without baking in old tenant
  values, configure optional GitHub Actions repository **Variables**
  `MARINEAQUA_EXPECTED_DB_SHA256` and `MARINEAQUA_DISALLOWED_DB_SHA256`.
- `marineaqua-php-release.yml`: manual PHP-only FTPS deployment, requires
  `confirm=DEPLOY_PHP`. It does **not** build Astro.

Expected repo secrets for supported operations: `ENV_FILE`, `SOURCE_REPO_PAT`,
`FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`, and optionally the
WordPress admin credentials used only by browser tests. Configure these for
each cloned project; do not reuse a previous customer's endpoints or data.

In code mode **normal**, source changes and source-only tests are allowed.
Do not dispatch the production build or upload WordPress files over FTP without
explicit approval. Never assume a sanitized source tree implies a sanitized
live WordPress database.
