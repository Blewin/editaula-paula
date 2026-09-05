# New folder / new document appear in the current view

Both options are possible. Option one is already the intended design — the buttons in the left panel already try to add the new item to the view you are in — but the membership is not saved reliably, so the item can vanish from the view. The fix is to make that save reliable, and (optionally) also add the two icons next to the view name.

## What will change

1. When a view is open and you press New folder or New document, the item appears in that view immediately and stays there after a refresh.
2. Small New folder and New document icons appear next to the view's name in the header, doing exactly the same thing (handy when you are deep in a view).
3. Inside Home or a normal folder nothing changes: items are just created there.
4. Starred stays as-is (nothing new can be created there, since starring is what puts things in it).

## Technical notes

Cause of the current unreliability (confirmed in the code and database schema): `handleNewDoc` / `handleNewFolder` call `createDoc` / `createFolder`, which insert into `items` as fire-and-forget, then immediately call `addItemToView`, which inserts into `view_items`. `view_items.item_id` has a foreign key to `items(id)`, so the membership insert can hit the database before the item row exists and fail with a foreign-key violation. The optimistic local state looks right until a realtime refetch or reload drops it.

Changes:
- `src/lib/storage.ts`: give `createDoc` and `createFolder` awaitable variants (or return the insert promise), following the existing `createDocWithContent` pattern that already awaits the item insert before writing `view_items`. Add an `addItemToView` call that runs only after the item insert resolves.
- `src/routes/_authenticated/index.tsx`: make `handleNewDoc` / `handleNewFolder` async and pass `activeView?.id` down, so view membership is created in one ordered operation; keep the optimistic local update so the tile shows instantly. Add the two icon buttons next to the view title, reusing the same handlers.
