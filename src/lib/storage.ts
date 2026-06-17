import * as React from "react";
import { supabase } from "@/integrations/supabase/client";

export type Item =
  | {
      id: string;
      type: "doc";
      name: string;
      parentId: string | null;
      content: string;
      updatedAt: number;
      starred?: boolean;
    }
  | {
      id: string;
      type: "folder";
      name: string;
      parentId: string | null;
      color: string;
      updatedAt: number;
      starred?: boolean;
    };

export type View = {
  id: string;
  name: string;
  itemIds: string[];
};

export const FOLDER_COLORS = [
  "#94a3b8", "#64748b", "#f59e0b", "#fbbf24", "#d97706",
  "#10b981", "#34d399", "#059669", "#84cc16", "#22c55e",
  "#3b82f6", "#60a5fa", "#1d4ed8", "#0ea5e9", "#6366f1",
  "#a855f7", "#c084fc", "#7c3aed", "#d946ef", "#ef4444",
  "#f87171", "#b91c1c", "#ec4899", "#f472b6", "#14b8a6",
];

// ---------- In-memory cache + subscribers ----------

type ItemRow = {
  id: string;
  user_id: string;
  type: "doc" | "folder";
  name: string;
  parent_id: string | null;
  content: string;
  color: string;
  starred: boolean;
  position: number;
  updated_at: string;
};

type ViewRow = {
  id: string;
  user_id: string;
  name: string;
  position: number;
};

type ViewItemRow = {
  view_id: string;
  item_id: string;
  user_id: string;
  position: number;
};

let _items: Item[] = [];
let _views: View[] = [];
let _currentUserId: string | null = null;
let _loaded = false;
let _loadingPromise: Promise<void> | null = null;
const _subs = new Set<() => void>();

function notify() {
  for (const s of _subs) s();
}

function rowToItem(r: ItemRow): Item {
  const base = {
    id: r.id,
    name: r.name,
    parentId: r.parent_id,
    starred: r.starred,
    updatedAt: new Date(r.updated_at).getTime(),
  };
  if (r.type === "doc") {
    return { ...base, type: "doc", content: r.content } as Item;
  }
  return { ...base, type: "folder", color: r.color } as Item;
}

async function loadAll() {
  if (!_currentUserId) {
    _items = [];
    _views = [];
    _loaded = true;
    notify();
    return;
  }
  const [itemsRes, viewsRes, viewItemsRes] = await Promise.all([
    supabase.from("items").select("*").order("position", { ascending: true }),
    supabase.from("views").select("*").order("position", { ascending: true }),
    supabase.from("view_items").select("*").order("position", { ascending: true }),
  ]);
  if (itemsRes.error) console.error(itemsRes.error);
  if (viewsRes.error) console.error(viewsRes.error);
  if (viewItemsRes.error) console.error(viewItemsRes.error);

  _items = (itemsRes.data ?? []).map((r) => rowToItem(r as ItemRow));
  const viewItemsByView = new Map<string, string[]>();
  for (const vi of (viewItemsRes.data ?? []) as ViewItemRow[]) {
    const arr = viewItemsByView.get(vi.view_id) ?? [];
    arr.push(vi.item_id);
    viewItemsByView.set(vi.view_id, arr);
  }
  _views = ((viewsRes.data ?? []) as ViewRow[]).map((v) => ({
    id: v.id,
    name: v.name,
    itemIds: viewItemsByView.get(v.id) ?? [],
  }));
  _loaded = true;
  notify();
}

function ensureLoaded() {
  if (_loaded || _loadingPromise) return;
  _loadingPromise = loadAll().finally(() => {
    _loadingPromise = null;
  });
}

// Auth-state sync (browser only)
if (typeof window !== "undefined") {
  supabase.auth.getSession().then(({ data }) => {
    const uid = data.session?.user.id ?? null;
    if (uid !== _currentUserId) {
      _currentUserId = uid;
      _loaded = false;
      ensureLoaded();
    }
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    const uid = session?.user.id ?? null;
    if (uid !== _currentUserId) {
      _currentUserId = uid;
      _loaded = false;
      _items = [];
      _views = [];
      notify();
      ensureLoaded();
    }
  });
}

function useStore<T>(selector: () => T): T {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    ensureLoaded();
    const cb = () => force();
    _subs.add(cb);
    return () => {
      _subs.delete(cb);
    };
  }, []);
  return selector();
}

export function useItems(): Item[] {
  return useStore(() => _items);
}

export function useViews(): View[] {
  return useStore(() => _views);
}

export function getItem(id: string): Item | undefined {
  return _items.find((i) => i.id === id);
}

export function getBreadcrumb(folderId: string | null): { id: string | null; name: string }[] {
  const trail: { id: string | null; name: string }[] = [];
  let current = folderId;
  while (current) {
    const f = _items.find((i) => i.id === current);
    if (!f || f.type !== "folder") break;
    trail.unshift({ id: f.id, name: f.name });
    current = f.parentId;
  }
  trail.unshift({ id: null, name: "Home" });
  return trail;
}

function nextPosition(filter: (i: Item) => boolean): number {
  const siblings = _items.filter(filter);
  const max = siblings.reduce((m, i) => Math.max(m, (i as Item & { position?: number }).updatedAt), 0);
  return Math.max(Date.now(), max + 1);
}

// ---------- Mutations ----------

function genId(): string {
  return (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function createDoc(parentId: string | null, name = "Untitled"): string {
  const id = genId();
  if (!_currentUserId) return id;
  const content = `# ${name}\n\nStart writing...`;
  const position = nextPosition((i) => i.parentId === parentId);
  const newItem: Item = {
    id, type: "doc", name, parentId, content, updatedAt: Date.now(), starred: false,
  };
  _items = [..._items, newItem];
  notify();
  void supabase.from("items").insert({
    id, user_id: _currentUserId, type: "doc", name, parent_id: parentId,
    content, position,
  }).then(({ error }) => { if (error) console.error(error); });
  return id;
}

export function createFolder(parentId: string | null, name = "New folder"): string {
  const id = genId();
  if (!_currentUserId) return id;
  const color = FOLDER_COLORS[0];
  const position = nextPosition((i) => i.parentId === parentId);
  const newItem: Item = {
    id, type: "folder", name, parentId, color, updatedAt: Date.now(), starred: false,
  };
  _items = [..._items, newItem];
  notify();
  void supabase.from("items").insert({
    id, user_id: _currentUserId, type: "folder", name, parent_id: parentId,
    color, position,
  }).then(({ error }) => { if (error) console.error(error); });
  return id;
}

export function updateItem(id: string, patch: Partial<Item>) {
  const idx = _items.findIndex((i) => i.id === id);
  if (idx === -1) return;
  _items = _items.map((i, k) =>
    k === idx ? ({ ...i, ...patch, updatedAt: Date.now() } as Item) : i,
  );
  notify();
  const dbPatch: Record<string, unknown> = {};
  if ("name" in patch) dbPatch.name = patch.name;
  if ("content" in patch && (patch as { content?: string }).content !== undefined) {
    dbPatch.content = (patch as { content?: string }).content;
  }
  if ("color" in patch && (patch as { color?: string }).color !== undefined) {
    dbPatch.color = (patch as { color?: string }).color;
  }
  if ("starred" in patch) dbPatch.starred = !!patch.starred;
  if ("parentId" in patch) dbPatch.parent_id = patch.parentId;
  if (Object.keys(dbPatch).length === 0) return;
  void supabase.from("items").update(dbPatch).eq("id", id).then(({ error }) => {
    if (error) console.error(error);
  });
}

export function deleteItem(id: string) {
  // collect descendants
  const toDelete = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const it of _items) {
      if (it.parentId && toDelete.has(it.parentId) && !toDelete.has(it.id)) {
        toDelete.add(it.id);
        changed = true;
      }
    }
  }
  _items = _items.filter((i) => !toDelete.has(i.id));
  _views = _views.map((v) => ({ ...v, itemIds: v.itemIds.filter((i) => !toDelete.has(i)) }));
  notify();
  // DB cascade handles children via parent_id FK; delete root only
  void supabase.from("items").delete().eq("id", id).then(({ error }) => {
    if (error) console.error(error);
  });
}

export function reorderItem(activeId: string, overId: string, position: "before" | "after" = "before") {
  if (activeId === overId) return;
  const activeIdx = _items.findIndex((i) => i.id === activeId);
  const overIdx = _items.findIndex((i) => i.id === overId);
  if (activeIdx === -1 || overIdx === -1) return;
  if (_items[activeIdx].parentId !== _items[overIdx].parentId) return;
  const next = [..._items];
  const [moved] = next.splice(activeIdx, 1);
  const newOverIdx = next.findIndex((i) => i.id === overId);
  const insertAt = position === "after" ? newOverIdx + 1 : newOverIdx;
  next.splice(insertAt, 0, moved);
  _items = next;
  notify();
  // Recompute positions for siblings
  const parentId = moved.parentId;
  const siblings = _items.filter((i) => i.parentId === parentId);
  void Promise.all(
    siblings.map((it, idx) =>
      supabase.from("items").update({ position: idx + 1 }).eq("id", it.id),
    ),
  ).catch((e) => console.error(e));
}

// ---------- Views ----------

export function createView(name: string): string {
  const id = genId();
  if (!_currentUserId) return id;
  const position = Date.now();
  _views = [..._views, { id, name, itemIds: [] }];
  notify();
  void supabase.from("views").insert({
    id, user_id: _currentUserId, name, position,
  }).then(({ error }) => { if (error) console.error(error); });
  return id;
}

export function updateView(id: string, patch: Partial<Omit<View, "id">>) {
  _views = _views.map((v) => (v.id === id ? { ...v, ...patch } : v));
  notify();
  const dbPatch: Record<string, unknown> = {};
  if (patch.name !== undefined) dbPatch.name = patch.name;
  if (Object.keys(dbPatch).length === 0) return;
  void supabase.from("views").update(dbPatch).eq("id", id).then(({ error }) => {
    if (error) console.error(error);
  });
}

export function deleteView(id: string) {
  _views = _views.filter((v) => v.id !== id);
  notify();
  void supabase.from("views").delete().eq("id", id).then(({ error }) => {
    if (error) console.error(error);
  });
}

export function addItemToView(viewId: string, itemId: string) {
  if (!_currentUserId) return;
  const v = _views.find((x) => x.id === viewId);
  if (!v || v.itemIds.includes(itemId)) return;
  _views = _views.map((x) =>
    x.id === viewId ? { ...x, itemIds: [...x.itemIds, itemId] } : x,
  );
  notify();
  void supabase.from("view_items").insert({
    view_id: viewId, item_id: itemId, user_id: _currentUserId, position: Date.now(),
  }).then(({ error }) => { if (error) console.error(error); });
}

export function removeItemFromView(viewId: string, itemId: string) {
  _views = _views.map((x) =>
    x.id === viewId ? { ...x, itemIds: x.itemIds.filter((i) => i !== itemId) } : x,
  );
  notify();
  void supabase.from("view_items").delete()
    .eq("view_id", viewId).eq("item_id", itemId)
    .then(({ error }) => { if (error) console.error(error); });
}
