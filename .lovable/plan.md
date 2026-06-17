# Google login + cloud-synced data

## 1. Enable Lovable Cloud + Google sign-in
- Enable Lovable Cloud (provisions auth + DB).
- Configure Google as a social auth provider.
- Gate the app behind login:
  - Move `src/routes/index.tsx` and `src/routes/doc.$id.tsx` under `src/routes/_authenticated/` (the managed layout redirects unauthenticated users to `/auth`).
  - Add a small `/auth` page with a single "Continue with Google" button using the Lovable broker (`lovable.auth.signInWithOAuth("google", ...)`).
- Add a user menu (avatar + name from Google) in the home header with a "Sign out" action that clears the query cache and navigates to `/auth`.

## 2. Database schema (per-user)
Three tables, all RLS-scoped to `auth.uid()`:

- `items` — replaces today's `Item` type
  - `id uuid pk`, `user_id uuid references auth.users on delete cascade`
  - `type text check (type in ('doc','folder'))`
  - `name text`, `parent_id uuid null references items(id) on delete cascade`
  - `content text` (docs only), `color text` (folders only)
  - `starred bool default false`, `position int`, `updated_at timestamptz default now()`
- `views` — `id`, `user_id`, `name`, `created_at`
- `view_items` — `view_id`, `item_id`, `position` (composite PK)

Standard grants (`authenticated` + `service_role`), RLS enabled, policies: users can CRUD only rows where `user_id = auth.uid()` (and for `view_items`, only when the parent view belongs to them).

## 3. Replace `src/lib/storage.ts`
Rewrite the module to talk to Supabase instead of `localStorage`, keeping the same exported API surface so routes don't need rewrites:
- `useItems()`, `useViews()` → TanStack Query hooks (`useQuery`) subscribed to the current user.
- `createDoc/createFolder/updateItem/deleteItem/reorderItem` → Supabase mutations + `queryClient.invalidateQueries`.
- `getItem`, `getBreadcrumb` → async; doc route already loads via state, will be adapted.
- View functions (`createView/updateView/deleteView/addItemToView/removeItemFromView`) → Supabase.
- `FOLDER_COLORS` constant stays as-is.

No automatic migration from localStorage — users start fresh in the cloud (their previous local data remains in the browser but is not shown).

## 4. Route adjustments
- `doc.$id.tsx`: load doc via `useQuery`, save via mutation (debounced as today).
- `index.tsx`: same UI; data comes from the new hooks.
- Back-button "fromView/fromFolder" behavior preserved.

## Technical notes
- All DB writes happen client-side via the browser Supabase client; RLS enforces ownership (no server functions needed).
- Realtime sync across tabs/devices: subscribe to `items` and `views` changes for the current user and invalidate queries.
- No profiles table (per your answer — Google name/avatar read from the auth session).
