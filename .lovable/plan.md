## Bring back rich tile previews on Home

Restore the look from the screenshot: document tiles show a preview of the first page's content, and folder tiles show a colored gradient cover. These live only in Editaula — nothing extra is written to disk beyond what's already there.

### Doc tiles: first-page preview

- In `Tile` (src/routes/index.tsx), when `item.type === "doc"`, render a taller card with:
  - Header row: file icon + doc name + `…` menu (matches screenshot).
  - Body: a text preview of the first page.
- Preview source: read the first non-empty page of the doc's first tab from disk via a new lightweight helper in `src/lib/storage.ts` (e.g. `readDocPreview(docId, maxChars = 400)`) that:
  - Opens the doc folder, finds `<firstTab> - Page 1.md` (falling back to the lowest-indexed existing page), reads up to N chars, strips markdown noise minimally (leading `#`, list bullets).
  - Returns `""` if nothing exists yet.
- Loading model: `Tile` calls the helper in a `useEffect` and caches the result in local state. Re-run when `item.updatedAt` changes so edits refresh the preview. Cheap because it only runs for tiles currently rendered, and results are memoized per tile.
- Styling: monospace-ish body text, `line-clamp` to fit, muted color, first line rendered slightly bolder to mimic the "title line" in the screenshot.

### Folder tiles: gradient cover

- When `item.type === "folder"`, render:
  - Header row: folder icon (tinted with `folder.color`) + name + `…` menu.
  - Body: a gradient block filling the rest of the tile.
- Gradient derived from the folder's existing `color` field (already in the model, already color-pickable). Use `linear-gradient(135deg, color, mix-to-muted)` via `color-mix(in oklab, var(--muted) 60%, <color>)` so it looks like the soft dual-tone gradient in the screenshot. No new persisted data.
- Folders without a color fall back to a neutral slate→muted gradient.

### Layout adjustments

- Increase tile min size in the grid (e.g. `minmax(240px, 1fr)`) and change aspect to something taller (e.g. `aspect-[4/5]`) so previews have room, matching the screenshot proportions.
- Keep drag/drop, rename-in-place, star badge, and the `…` action menu working exactly as today; only the visual composition of the tile changes.
- Empty state, starred view, and custom views reuse the same `Tile` — no route logic changes.

### Out of scope

- No disk format changes, no new sidecar fields.
- Doc route, storage APIs for read/write pages, views, and folder gating are untouched.

### Files touched

- `src/lib/storage.ts` — add `readDocPreview` helper (read-only; uses existing root handle + walker knowledge).
- `src/routes/index.tsx` — restructure `Tile` rendering for docs vs folders, bump grid sizing.
