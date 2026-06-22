# Verification Notes

## Current Environment

- WSL PATH has no runnable Node.js toolchain:
  - `node -v` -> `command not found`
  - `pnpm typecheck` -> `pnpm: command not found`
  - `pnpm test` -> `pnpm: command not found`
- `node_modules` exists under `nice-ocr/`, but its `.bin/*` shims require a `node` executable.
- Do not start frontend/backend in this environment until Node.js is available.

## Automated Verification

Run from `nice-ocr/` after restoring Node.js >= 22 and pnpm:

```bash
pnpm db:generate
pnpm typecheck
pnpm test
```

Expected coverage for this change:

- `src/lib/recognition/__tests__/dynamic-schema.test.ts`
  - verifies valid `sourceRegion` is normalized and clamped.
  - verifies invalid `sourceRegion` is ignored without dropping business fields.
- `src/lib/workflows/__tests__/integration.test.ts`
  - verifies a recognized row can persist and read back `sourceRegionJson`.
- `src/components/ui/__tests__/image-region.test.ts`
  - verifies normalized boxes map to rendered image pixels.
  - verifies target-region viewport math centers regions for wide and tall images.

## Manual Review Workspace Verification

Use a fresh test batch with at least one image whose recognition result includes row-level `sourceRegionJson`.

1. Open the review workspace for the document.
2. Hover a row with region data.
   - Expected: the matching region is highlighted on the image.
   - Expected: the image does not pan or zoom from hover alone.
3. Click the row background or the locate button.
   - Expected: the image pans/zooms so the row region is visible near the center.
   - Expected: clicking editable cells still focuses the cell instead of forcing navigation.
4. Click the highlighted region on the image.
   - Expected: the matching table row is highlighted and scrolled into view.
5. Toggle focus mode and repeat hover/click.
   - Expected: overlay remains aligned after layout resize.
6. Use zoom buttons, Ctrl+wheel zoom, drag pan, then reset view.
   - Expected: overlay stays attached to the same visual image row during zoom/pan.
   - Expected: reset returns image pan/zoom to default without stale target state.
7. Verify an old document or a row without `sourceRegionJson`.
   - Expected: no misleading overlay is shown.
   - Expected: no locate button appears for that row.
   - Expected: normal review/edit actions still work.

## Visual Cases For 4.5

Capture screenshots or short clips for:

- a wide image with a region near the right side;
- a tall receipt/PDF page with a region near the bottom;
- a region after panel resize or focus-mode toggle;
- a region after manual zoom and drag;
- old data with no region.
