## Goal

Replace the single-file-with-markers doc format with a real folder-per-doc layout. Each tab+page becomes an ordinary `.md` file. Empty pages produce no file.

## On-disk layout

For a doc named `My Note` inside `Ideas/`:

```text
Ideas/
  My Note/                  ← doc folder
    Tab 1 - Page 1.md
    Tab 1 - Page 2.md
    Notes tab - Page 1.md
```

- File name pattern: `<Tab name> - Page <N>.md` (1-indexed pages).
- Only non-empty pages are written; when a page becomes empty its file is deleted.
- Regular (non-doc) folders keep behaving as before: children can be folders or docs.

## Distinguishing doc-folders from regular folders

A folder is a "doc" iff it appears in the sidecar's new `docs` map. This is authoritative — no filename sniffing.

Extended `.editaula.json`:

```jsonc
{
  "meta":   { /* colors, starred */ },
  "order":  { /* sibling order */ },
  "views":  [ /* unchanged */ ],
  "docs":   {
    "Ideas/My Note": { "tabs": ["Tab 1", "Notes tab"] }
  }
}
```

`tabs` is an ordered list of tab display names. Pages are not tracked in the sidecar — they're derived from the files on disk.

## Storage layer changes (`src/lib/storage.ts`)

1. Drop `content` from the doc `Item` type. Docs are now purely identified by path; their body lives in child files.
2. Walking the tree: when entering a directory whose relative path is a key in `_sidecar.docs`, emit a single `type: "doc"` item and **do not recurse into it**. Otherwise recurse as a folder.
3. Rewrite mutations:
   - `createDoc(parentId, name)` — creates the doc folder, adds `docs[path] = { tabs: ["Tab 1"] }`, writes no page files (empty).
   - `deleteItem` — for docs, recursively removes the folder and deletes `docs[path]`.
   - `updateItem` name change on a doc — folder rename + remap `docs` key + remap sidecar `meta`/`order`/`views` entries (already done for other kinds).
   - Folder rename that contains doc folders — remap every `docs` key under the old prefix.
4. New async API for the editor:
   - `readDoc(docId): Promise<{ tabs: { name: string; pages: string[] }[] }>` — reads sidecar `tabs` for order, then for each tab reads any matching `<tab> - Page <N>.md` files. Missing page indices become empty strings up to the max found page.
   - `writeDocPage(docId, tabName, pageIndex, content)` — write file (create dirs as needed) or delete file when `content.trim() === ""`.
   - `renameDocTab(docId, oldName, newName)` — rename every existing `<oldName> - Page N.md` to `<newName> - Page N.md`, update sidecar `tabs`.
   - `setDocTabs(docId, tabs: string[])` — update sidecar order/added/removed tabs; removing a tab deletes its page files.
5. Filename sanitisation: reuse `sanitizeName`; tab names cannot contain `/\\:*?"<>|` — already sanitized on rename in `TabItem`. Reject renames that would collide with an existing tab.

## Doc route changes (`src/routes/doc.$id.tsx`)

1. Remove `TABS_MARKER`/`SEP` parsing entirely.
2. On mount / when `id` changes, call `readDoc(id)` and hydrate local state:
   - `tabs: { name: string; pages: string[] }[]`
   - `activeTab`, `activeSheet`, `sheets` (derived from `tabs[activeTab].pages`).
3. Persistence — replace the debounced whole-file write with a per-page diff:
   - Keep a ref of the last-persisted `tabs` shape.
   - On debounce (400 ms), for each `(tabName, pageIndex)` whose content differs from the ref, call `writeDocPage(...)`.
   - When switching tab or leaving the route, flush pending writes.
4. Tab operations map to storage:
   - Add tab → append to sidecar tabs, no file yet.
   - Rename active tab (`renameTab`) → call `renameDocTab`; reject on collision.
   - (No delete-tab UI exists today, so we leave it out.)
5. Doc rename (title input) still routes through `updateItem` and the existing "navigate to new id after rename" logic keeps working, because the doc-folder rename remaps the id the same way.

## Home route (`src/routes/index.tsx`)

No structural changes — docs still surface as a single tile because the walker stops at doc folders. `FileText` icon is already used for `type: "doc"`.

## Out of scope / notes

- **No migration** of pre-existing single-file docs. Users starting fresh get the new format; any legacy `.md` files left in a folder still appear as regular files but won't have a "doc" wrapper (the walker treats them as unknown → skipped, since docs are keyed by sidecar). We'll surface this in a follow-up if needed.
- Views (`docs.itemIds`) reference the doc-folder id, which is stable across the change.
- File System Access API move semantics unchanged — rename uses `move()` when available, falls back to copy+delete.

## Acceptance

- Creating a new doc creates an empty folder on disk, no `.md` files inside.
- Typing on Page 1 of Tab 1 creates `Tab 1 - Page 1.md` with exactly that text (plain markdown, no marker header).
- Adding "Tab 2" then writing on its Page 3 creates `Tab 2 - Page 3.md` and leaves Page 1/2 files absent.
- Clearing a page's content deletes its file.
- Renaming the active tab from "Tab 1" to "Draft" renames every `Tab 1 - Page N.md` to `Draft - Page N.md`.
- Renaming the doc renames its folder; reopening it still shows the same tabs and pages.
- Home shows one tile per doc, opening it round-trips the content correctly.
