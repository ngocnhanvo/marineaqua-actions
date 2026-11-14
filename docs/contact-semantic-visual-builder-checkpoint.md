# Marine Aqua — Contact Page semantic ESC Table checkpoint (2026-11-14, Asia/Ho_Chi_Minh)

## Completed and verified
- WordPress Page ID `82580`, slug `lien-he` owns native ESC Table `contact_semantics_vi`.
- CMS native Save/REST audit: [run 43541439591](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43541439591) SUCCESS; one logical shortcode, 0 further changes, TablePress preview badge excluded from duplicate count.
- Actions repair: `e1417508f565635e785dba46462671423ba11f59`.
- Astro `master` source: `036676f02d3b9afe9275afc58c0e50a2dae2145e`.
  - `src/lib/wordpress/pages/getData.ts`: avoid duplicate shortcode from Classic Editor preview wrapper.
  - `src/lib/wordpress/pages/index.ts`: generic `modified_gmt` Page inventory reconciliation when change logs miss edits.
- Canonical production build and signed deploy: [run 43542023346](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43542023346) SUCCESS; bridge [run 43541995974](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43541995974) SUCCESS.
- Read-only Playwright desktop/mobile: [run 43542223866](https://github.com/ngocnhanvo/marineaqua-actions/actions/runs/43542223866) PASS; HTTP 200, ESC labels with source rows, native Header link, text, contact links, no horizontal overflow (1366px/390px).
- No WordPress record created in the final idempotent CMS run. No additional deploy pipeline.

## Next work (not DONE)
- Audit all WordPress Header destination Pages for complete editable semantic fields in Visual Builder.
- Check that local ESC Table `Product`, `ProductCategory`, `Page` references support adding, removing, reordering, cancel, save/readback and Builder preview on each relevant Page; source code PASS alone is not full live coverage.
- Validate remaining Page-level semantics, links, image fields and shared components via authenticated browser QA.
- Do not redo earlier successful homepage/Product reference workflows without evidence of regressions.

Chế độ code: auto-build
Cổng ghi source: bypass
Trạng thái: PARTIAL — chưa hoàn tất
