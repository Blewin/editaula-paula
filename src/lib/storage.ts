import * as React from "react";

export type Item =
  | {
      id: string;
      type: "doc";
      name: string;
      parentId: string | null;
      content: string;
      updatedAt: number;
    }
  | {
      id: string;
      type: "folder";
      name: string;
      parentId: string | null;
      color: string;
      updatedAt: number;
    };

const KEY = "md-editor-items-v1";

export const FOLDER_COLORS = [
  "#94a3b8", // slate
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ef4444", // red
  "#ec4899", // pink
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
