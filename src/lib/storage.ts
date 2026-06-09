import * as React from "react";

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

const KEY = "md-editor-items-v1";

export const FOLDER_COLORS = [
  "#94a3b8", // slate
  "#64748b", // slate dark
  "#f59e0b", // amber
  "#fbbf24", // amber light
  "#d97706", // amber dark
  "#10b981", // emerald
  "#34d399", // emerald light
  "#059669", // emerald dark
  "#84cc16", // lime
  "#22c55e", // green
  "#3b82f6", // blue
  "#60a5fa", // blue light
  "#1d4ed8", // blue dark
  "#0ea5e9", // sky
  "#6366f1", // indigo
  "#a855f7", // purple
  "#c084fc", // purple light
  "#7c3aed", // violet
  "#d946ef", // fuchsia
  "#ef4444", // red
  "#f87171", // red light
  "#b91c1c", // red dark
  "#ec4899", // pink
  "#f472b6", // pink light
  "#14b8a6", // teal
];

function read(): Item[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Item[]) : [];
  } catch {
    return [];
  }
}

function write(items: Item[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("md-items-changed"));
}

export function useItems() {
  const [items, setItems] = React.useState<Item[]>(() => read());
  React.useEffect(() => {
    const sync = () => setItems(read());
    sync();
    window.addEventListener("md-items-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("md-items-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return items;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function createDoc(parentId: string | null, name = "Untitled"): string {
  const items = read();
  const id = uid();
  items.push({
    id,
    type: "doc",
    name,
    parentId,
    content: `# ${name}\n\nStart writing...`,
    updatedAt: Date.now(),
  });
  write(items);
  return id;
}

export function createFolder(parentId: string | null, name = "New folder"): string {
  const items = read();
  const id = uid();
  items.push({
    id,
    type: "folder",
    name,
    parentId,
    color: FOLDER_COLORS[0],
    updatedAt: Date.now(),
  });
  write(items);
  return id;
}

export function updateItem(id: string, patch: Partial<Item>) {
  const items = read();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return;
  items[idx] = { ...items[idx], ...patch, updatedAt: Date.now() } as Item;
  write(items);
}

export function deleteItem(id: string) {
  let items = read();
  // recursive: collect descendants
  const toDelete = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const it of items) {
      if (it.parentId && toDelete.has(it.parentId) && !toDelete.has(it.id)) {
        toDelete.add(it.id);
        changed = true;
      }
    }
  }
  items = items.filter((i) => !toDelete.has(i.id));
  write(items);
}

export function reorderItem(activeId: string, overId: string, position: "before" | "after" = "before") {
  if (activeId === overId) return;
  const items = read();
  const activeIdx = items.findIndex((i) => i.id === activeId);
  const overIdx = items.findIndex((i) => i.id === overId);
  if (activeIdx === -1 || overIdx === -1) return;
  if (items[activeIdx].parentId !== items[overIdx].parentId) return;
  const [moved] = items.splice(activeIdx, 1);
  const newOverIdx = items.findIndex((i) => i.id === overId);
  const insertAt = position === "after" ? newOverIdx + 1 : newOverIdx;
  items.splice(insertAt, 0, moved);
  write(items);
}

export function getItem(id: string): Item | undefined {
  return read().find((i) => i.id === id);
}

export function getBreadcrumb(folderId: string | null): { id: string | null; name: string }[] {
  const items = read();
  const trail: { id: string | null; name: string }[] = [];
  let current = folderId;
  while (current) {
    const f = items.find((i) => i.id === current);
    if (!f || f.type !== "folder") break;
    trail.unshift({ id: f.id, name: f.name });
    current = f.parentId;
  }
  trail.unshift({ id: null, name: "Home" });
  return trail;
}

// ---------- Views ----------

export type View = {
  id: string;
  name: string;
  // null = bookmark to Home; otherwise a folder id
  folderId: string | null;
};

const VIEWS_KEY = "md-editor-views-v1";

function readViews(): View[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(VIEWS_KEY);
    return raw ? (JSON.parse(raw) as View[]) : [];
  } catch {
    return [];
  }
}

function writeViews(views: View[]) {
  localStorage.setItem(VIEWS_KEY, JSON.stringify(views));
  window.dispatchEvent(new Event("md-views-changed"));
}

export function useViews() {
  const [views, setViews] = React.useState<View[]>(() => readViews());
  React.useEffect(() => {
    const sync = () => setViews(readViews());
    sync();
    window.addEventListener("md-views-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("md-views-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return views;
}

export function createView(name: string, folderId: string | null): string {
  const views = readViews();
  const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  views.push({ id, name, folderId });
  writeViews(views);
  return id;
}

export function deleteView(id: string) {
  writeViews(readViews().filter((v) => v.id !== id));
}
