import * as React from "react";

export type Item =
  | {
      id: string;
      type: "doc";
      name: string;
      parentId: string | null;
      updatedAt: number;
      starred?: boolean;
      preview?: string;
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

// ============================================================================
// File System Access API storage
// ----------------------------------------------------------------------------
// Item ids:
//   "d:<relative/path>"  for folders
//   "f:<relative/path>"  for docs (docs are folders on disk)
// Docs are folders on disk containing `<Tab name> - Page <N>.md` files.
// Sidecar `.editaula.json` at the root stores color, starred, order, views,
// and the list of doc folders (with tab order/names).
// ============================================================================

const SIDECAR = ".editaula.json";
const IDB_NAME = "editaula";
const IDB_STORE = "handles";
const IDB_KEY_ROOT = "root";

type SidecarMeta = { color?: string; starred?: boolean };
type DocMeta = { tabs: string[] };
type SidecarData = {
  meta: Record<string, SidecarMeta>;
  order: Record<string, string[]>; // key: parentId ("" = root) → child ids
  views: { id: string; name: string; itemIds: string[] }[];
  docs: Record<string, DocMeta>; // key: relative path of doc folder
};

export type RootStatus =
  | "unknown"
  | "no-support"
  | "no-folder"
  | "needs-permission"
  | "loading"
  | "ready"
  | "error";

let _root: FileSystemDirectoryHandle | null = null;
let _rootName: string | null = null;
let _items: Item[] = [];
let _views: View[] = [];
let _sidecar: SidecarData = { meta: {}, order: {}, views: [], docs: {} };
let _status: RootStatus = "unknown";
const _subs = new Set<() => void>();

function notify() { for (const s of _subs) s(); }
function setStatus(s: RootStatus) { _status = s; notify(); }

// ---------- IndexedDB (persist handle across reloads) ----------
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readonly");
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => res(req.result as T | undefined);
    req.onerror = () => rej(req.error);
  });
}
async function idbPut(key: string, value: unknown): Promise<void> {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbDel(key: string): Promise<void> {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// ---------- Path/id helpers ----------
function idFolder(path: string): string { return "d:" + path; }
function idDoc(path: string): string { return "f:" + path; }
function pathOf(id: string): string { return id.slice(2); }

function joinPath(parent: string | null, name: string): string {
  const parentPath = parent ? pathOf(parent) : "";
  return parentPath ? `${parentPath}/${name}` : name;
}

function sanitizeName(name: string): string {
  return name.replace(/[/\\:*?"<>|\r\n]/g, "_").trim() || "Untitled";
}

async function resolveDir(path: string, create = false): Promise<FileSystemDirectoryHandle> {
  let cur = _root!;
  if (!path) return cur;
  for (const seg of path.split("/")) {
    cur = await cur.getDirectoryHandle(seg, { create });
  }
  return cur;
}

// ---------- Sidecar load/save ----------
async function readSidecar(): Promise<SidecarData> {
  try {
    const fh = await _root!.getFileHandle(SIDECAR);
    const f = await fh.getFile();
    const data = JSON.parse(await f.text()) as Partial<SidecarData>;
    return {
      meta: data.meta ?? {},
      order: data.order ?? {},
      views: data.views ?? [],
      docs: data.docs ?? {},
    };
  } catch {
    return { meta: {}, order: {}, views: [], docs: {} };
  }
}

let _sidecarTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSidecarWrite() {
  if (!_root) return;
  if (_sidecarTimer) clearTimeout(_sidecarTimer);
  _sidecarTimer = setTimeout(() => { void writeSidecar(); }, 300);
}
async function writeSidecar() {
  if (!_root) return;
  try {
    const fh = await _root.getFileHandle(SIDECAR, { create: true });
    const w = await fh.createWritable();
    await w.write(JSON.stringify(_sidecar, null, 2));
    await w.close();
  } catch (e) { console.error("sidecar write", e); }
}

// ---------- Walk the tree ----------
type DirEntries = AsyncIterable<[string, FileSystemHandle]>;

async function walk(dir: FileSystemDirectoryHandle, parentPath: string, parentId: string | null): Promise<Item[]> {
  const out: Item[] = [];
  const entries = (dir as unknown as { entries: () => DirEntries }).entries();
  for await (const [name, handle] of entries) {
    if (name === SIDECAR || name.startsWith(".")) continue;
    if (handle.kind === "directory") {
      const path = parentPath ? `${parentPath}/${name}` : name;
      if (_sidecar.docs[path]) {
        // Doc-folder: surface as one doc item, do not recurse.
        const id = idDoc(path);
        const meta = _sidecar.meta[id] ?? {};
        const preview = await readDocPreview(handle as FileSystemDirectoryHandle, _sidecar.docs[path].tabs);
        out.push({
          id, type: "doc", name, parentId,
          starred: !!meta.starred,
          updatedAt: Date.now(),
          preview,
        });
      } else {
        const id = idFolder(path);
        const meta = _sidecar.meta[id] ?? {};
        out.push({
          id, type: "folder", name, parentId,
          color: meta.color ?? FOLDER_COLORS[0],
          starred: !!meta.starred,
          updatedAt: Date.now(),
        });
        const children = await walk(handle as FileSystemDirectoryHandle, path, id);
        out.push(...children);
      }
    }
    // Stray .md files at non-doc directories are ignored.
  }
  return out;
}

function sortItemsByOrder(items: Item[]): Item[] {
  const byParent = new Map<string, Item[]>();
  for (const it of items) {
    const k = it.parentId ?? "";
    const arr = byParent.get(k) ?? [];
    arr.push(it);
    byParent.set(k, arr);
  }
  const result: Item[] = [];
  for (const [parentKey, siblings] of byParent) {
    const order = _sidecar.order[parentKey] ?? [];
    const idx = new Map(order.map((id, i) => [id, i]));
    siblings.sort((a, b) => {
      const ai = idx.has(a.id) ? idx.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const bi = idx.has(b.id) ? idx.get(b.id)! : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.name.localeCompare(b.name);
    });
    result.push(...siblings);
  }
  return result;
}

async function loadAll() {
  if (!_root) return;
  setStatus("loading");
  try {
    _sidecar = await readSidecar();
    const items = await walk(_root, "", null);
    _items = sortItemsByOrder(items);
    _views = _sidecar.views.map((v) => ({ id: v.id, name: v.name, itemIds: [...v.itemIds] }));
    setStatus("ready");
  } catch (e) {
    console.error(e);
    setStatus("error");
  }
}

// ---------- Root selection ----------
type WithPermissions = FileSystemDirectoryHandle & {
  queryPermission: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
};

async function tryRestore() {
  if (typeof window === "undefined") return;
  if (!("showDirectoryPicker" in window)) { setStatus("no-support"); return; }
  let saved: FileSystemDirectoryHandle | undefined;
  try { saved = await idbGet<FileSystemDirectoryHandle>(IDB_KEY_ROOT); } catch { saved = undefined; }
  if (!saved) { setStatus("no-folder"); return; }
  _root = saved;
  _rootName = saved.name;
  try {
    const perm = await (saved as WithPermissions).queryPermission({ mode: "readwrite" });
    if (perm === "granted") await loadAll();
    else setStatus("needs-permission");
  } catch {
    setStatus("needs-permission");
  }
}

export async function pickFolder(): Promise<void> {
  if (typeof window === "undefined" || !("showDirectoryPicker" in window)) {
    setStatus("no-support"); return;
  }
  try {
    const handle = await (window as unknown as {
      showDirectoryPicker: (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker({ mode: "readwrite" });
    _root = handle;
    _rootName = handle.name;
    try { await idbPut(IDB_KEY_ROOT, handle); } catch { /* ignore */ }
    await loadAll();
  } catch (e) {
    if ((e as Error).name !== "AbortError") console.error(e);
  }
}

export async function reconnectFolder(): Promise<void> {
  if (!_root) { setStatus("no-folder"); return; }
  try {
    const perm = await (_root as WithPermissions).requestPermission({ mode: "readwrite" });
    if (perm === "granted") await loadAll();
    else setStatus("needs-permission");
  } catch (e) {
    console.error(e);
    setStatus("needs-permission");
  }
}

export async function forgetFolder(): Promise<void> {
  _root = null;
  _rootName = null;
  _items = [];
  _views = [];
  _sidecar = { meta: {}, order: {}, views: [], docs: {} };
  try { await idbDel(IDB_KEY_ROOT); } catch { /* ignore */ }
  setStatus("no-folder");
}

if (typeof window !== "undefined") {
  void tryRestore();
}

// ---------- Subscription hook ----------
function useStore<T>(sel: () => T): T {
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    const cb = () => force();
    _subs.add(cb);
    return () => { _subs.delete(cb); };
  }, []);
  return sel();
}

export function useItems(): Item[] { return useStore(() => _items); }
export function useViews(): View[] { return useStore(() => _views); }
export function useRootStatus(): RootStatus { return useStore(() => _status); }
export function useRootName(): string | null { return useStore(() => _rootName); }

export function getItem(id: string): Item | undefined { return _items.find((i) => i.id === id); }

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

// ---------- Mutations ----------
function uniqueName(parentId: string | null, base: string, kind: "doc" | "folder"): string {
  const siblings = _items.filter((i) => i.parentId === parentId && i.type === kind).map((i) => i.name);
  let n = base;
  let k = 2;
  while (siblings.includes(n)) n = `${base} ${k++}`;
  return n;
}

function insertOrder(parentId: string | null, id: string) {
  const k = parentId ?? "";
  const arr = _sidecar.order[k] ?? _items.filter((i) => i.parentId === parentId).map((i) => i.id);
  if (!arr.includes(id)) arr.push(id);
  _sidecar.order[k] = arr;
}

function removeOrder(id: string, parentId: string | null) {
  const k = parentId ?? "";
  const arr = _sidecar.order[k];
  if (!arr) return;
  _sidecar.order[k] = arr.filter((x) => x !== id);
}

export function createDoc(parentId: string | null, name = "Untitled"): string {
  const finalName = uniqueName(parentId, sanitizeName(name), "doc");
  const path = joinPath(parentId, finalName);
  const id = idDoc(path);
  const item: Item = { id, type: "doc", name: finalName, parentId, updatedAt: Date.now(), starred: false };
  _items = [..._items, item];
  insertOrder(parentId, id);
  _sidecar.docs[path] = { tabs: ["Tab 1"] };
  notify();
  void (async () => {
    try {
      await resolveDir(path, true); // create the doc folder (empty)
      scheduleSidecarWrite();
    } catch (e) { console.error(e); }
  })();
  return id;
}

export function createFolder(parentId: string | null, name = "New folder"): string {
  const finalName = uniqueName(parentId, sanitizeName(name), "folder");
  const path = joinPath(parentId, finalName);
  const id = idFolder(path);
  const color = FOLDER_COLORS[0];
  const item: Item = { id, type: "folder", name: finalName, parentId, color, updatedAt: Date.now(), starred: false };
  _items = [..._items, item];
  insertOrder(parentId, id);
  _sidecar.meta[id] = { color };
  notify();
  void (async () => {
    try {
      await resolveDir(path, true);
      scheduleSidecarWrite();
    } catch (e) { console.error(e); }
  })();
  return id;
}

export function updateItem(id: string, patch: Partial<Item>): string {
  const idx = _items.findIndex((i) => i.id === id);
  if (idx === -1) return id;
  const cur = _items[idx];
  const nextName = "name" in patch && patch.name ? sanitizeName(patch.name) : cur.name;

  let currentId = id;
  if (nextName !== cur.name) {
    const newId = performRename(cur, nextName);
    if (newId) currentId = newId;
  }

  const idx2 = _items.findIndex((i) => i.id === currentId);
  if (idx2 === -1) return currentId;
  const cur2 = _items[idx2];

  const next = { ...cur2, ...patch, name: nextName, updatedAt: Date.now() } as Item;
  _items = _items.map((i, k) => (k === idx2 ? next : i));
  const meta: SidecarMeta = { ..._sidecar.meta[currentId] };
  if ("color" in patch && (patch as { color?: string }).color !== undefined) meta.color = (patch as { color?: string }).color!;
  if ("starred" in patch) meta.starred = !!patch.starred;
  _sidecar.meta[currentId] = meta;
  notify();
  scheduleSidecarWrite();
  return currentId;
}

function performRename(cur: Item, newName: string): string | null {
  const oldId = cur.id;
  const oldPath = pathOf(oldId);
  const parentPath = cur.parentId ? pathOf(cur.parentId) : "";
  const newPath = parentPath ? `${parentPath}/${newName}` : newName;
  const newId = cur.type === "doc" ? idDoc(newPath) : idFolder(newPath);
  if (newId === oldId) return null;

  // Guard against overwriting sibling with same-name/type
  const siblingConflict = _items.some(
    (i) => i.parentId === cur.parentId && i.type === cur.type && i.name === newName,
  );
  if (siblingConflict) return null;

  const remapPath = (p: string): string => {
    if (p === oldPath) return newPath;
    if (p.startsWith(oldPath + "/")) return newPath + p.slice(oldPath.length);
    return p;
  };

  const remap = (id: string): string => {
    if (id === oldId) return newId;
    // Folder rename affects all descendant ids (both f: and d:).
    // Doc rename only affects the exact id (docs have no descendants in _items).
    if (cur.type === "folder") {
      const p = id.slice(2);
      if (p === oldPath || p.startsWith(oldPath + "/")) {
        return id.slice(0, 2) + remapPath(p);
      }
    }
    return id;
  };

  _items = _items.map((i) => {
    const nid = remap(i.id);
    const npid = i.parentId ? remap(i.parentId) : null;
    if (i.id === oldId) return { ...i, id: nid, name: newName, updatedAt: Date.now() } as Item;
    if (nid !== i.id || npid !== i.parentId) return { ...i, id: nid, parentId: npid } as Item;
    return i;
  });

  const newMeta: Record<string, SidecarMeta> = {};
  for (const [k, v] of Object.entries(_sidecar.meta)) newMeta[remap(k)] = v;
  _sidecar.meta = newMeta;

  const newOrder: Record<string, string[]> = {};
  for (const [k, arr] of Object.entries(_sidecar.order)) {
    const nk = k ? remap(k) : "";
    newOrder[nk] = arr.map(remap);
  }
  _sidecar.order = newOrder;

  // Remap doc paths in sidecar.docs
  const newDocs: Record<string, DocMeta> = {};
  for (const [k, v] of Object.entries(_sidecar.docs)) {
    if (cur.type === "doc") {
      newDocs[k === oldPath ? newPath : k] = v;
    } else {
      newDocs[remapPath(k)] = v;
    }
  }
  _sidecar.docs = newDocs;

  _sidecar.views = _sidecar.views.map((v) => ({ ...v, itemIds: v.itemIds.map(remap) }));
  _views = _views.map((v) => ({ ...v, itemIds: v.itemIds.map(remap) }));
  notify();

  // Both docs and folders are directories on disk now.
  void (async () => {
    try {
      const parentDir = await resolveDir(parentPath);
      const oldLeaf = oldPath.split("/").pop()!;
      await renameDirectory(parentDir, oldLeaf, newName);
      scheduleSidecarWrite();
    } catch (e) { console.error(e); }
  })();
  return newId;
}

// Rename a directory inside `parent`. Prefers native `move()`, falls back to
// a recursive copy + remove so it works in browsers where `move()` on
// directories isn't implemented yet.
async function renameDirectory(
  parent: FileSystemDirectoryHandle,
  oldName: string,
  newName: string,
): Promise<void> {
  if (oldName === newName) return;
  const src = await parent.getDirectoryHandle(oldName);
  const withMove = src as FileSystemDirectoryHandle & { move?: (n: string) => Promise<void> };
  if (typeof withMove.move === "function") {
    try {
      await withMove.move(newName);
      return;
    } catch (e) {
      console.warn("Native directory move failed, falling back to copy:", e);
    }
  }
  const dst = await parent.getDirectoryHandle(newName, { create: true });
  await copyDirectoryContents(src, dst);
  await parent.removeEntry(oldName, { recursive: true });
}

async function copyDirectoryContents(
  src: FileSystemDirectoryHandle,
  dst: FileSystemDirectoryHandle,
): Promise<void> {
  const entries = (src as unknown as { entries: () => DirEntries }).entries();
  for await (const [name, handle] of entries) {
    if (handle.kind === "file") {
      const srcFh = handle as FileSystemFileHandle;
      const file = await srcFh.getFile();
      const dstFh = await dst.getFileHandle(name, { create: true });
      const w = await dstFh.createWritable();
      await w.write(await file.arrayBuffer());
      await w.close();
    } else if (handle.kind === "directory") {
      const srcDh = handle as FileSystemDirectoryHandle;
      const dstDh = await dst.getDirectoryHandle(name, { create: true });
      await copyDirectoryContents(srcDh, dstDh);
    }
  }
}


export function deleteItem(id: string) {
  const item = _items.find((i) => i.id === id);
  if (!item) return;
  const toDelete = new Set<string>([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const it of _items) {
      if (it.parentId && toDelete.has(it.parentId) && !toDelete.has(it.id)) {
        toDelete.add(it.id); changed = true;
      }
    }
  }
  _items = _items.filter((i) => !toDelete.has(i.id));
  removeOrder(id, item.parentId);
  for (const did of toDelete) delete _sidecar.meta[did];

  // Drop any docs whose path falls under a deleted id
  const deletedPaths = new Set<string>();
  for (const did of toDelete) deletedPaths.add(pathOf(did));
  const newDocs: Record<string, DocMeta> = {};
  for (const [k, v] of Object.entries(_sidecar.docs)) {
    let keep = true;
    for (const dp of deletedPaths) {
      if (k === dp || k.startsWith(dp + "/")) { keep = false; break; }
    }
    if (keep) newDocs[k] = v;
  }
  _sidecar.docs = newDocs;

  _views = _views.map((v) => ({ ...v, itemIds: v.itemIds.filter((x) => !toDelete.has(x)) }));
  _sidecar.views = _sidecar.views.map((v) => ({ ...v, itemIds: v.itemIds.filter((x) => !toDelete.has(x)) }));
  notify();
  void (async () => {
    try {
      const parentPath = item.parentId ? pathOf(item.parentId) : "";
      const parentDir = await resolveDir(parentPath);
      const leaf = pathOf(id).split("/").pop()!;
      await parentDir.removeEntry(leaf, { recursive: true });
      scheduleSidecarWrite();
    } catch (e) { console.error(e); }
  })();
}

export function reorderItem(activeId: string, overId: string, position: "before" | "after" = "before") {
  if (activeId === overId) return;
  const a = _items.find((i) => i.id === activeId);
  const o = _items.find((i) => i.id === overId);
  if (!a || !o || a.parentId !== o.parentId) return;
  const k = a.parentId ?? "";
  const siblings = _items.filter((i) => i.parentId === a.parentId);
  const order = _sidecar.order[k] ?? siblings.map((i) => i.id);
  const next = order.filter((id) => id !== activeId);
  const oIdx = next.indexOf(overId);
  const insertAt = position === "after" ? oIdx + 1 : oIdx;
  next.splice(insertAt, 0, activeId);
  _sidecar.order[k] = next;
  _items = sortItemsByOrder(_items);
  notify();
  scheduleSidecarWrite();
}

// ---------- Doc contents (tabs + pages) ----------
export type DocTab = { name: string; pages: string[] };
export type DocData = { tabs: DocTab[] };

export function getDocTabs(docId: string): string[] {
  const path = pathOf(docId);
  return _sidecar.docs[path]?.tabs ?? ["Tab 1"];
}

export function sanitizeTabName(name: string): string {
  return sanitizeName(name);
}

function pageFileName(tab: string, pageIndex: number): string {
  return `${tab} - Page ${pageIndex + 1}.md`;
}

export async function readDoc(docId: string): Promise<DocData> {
  const path = pathOf(docId);
  const meta = _sidecar.docs[path] ?? { tabs: ["Tab 1"] };
  const tabs = meta.tabs.length > 0 ? meta.tabs : ["Tab 1"];
  // Match longest tab names first to avoid ambiguity.
  const sortedTabs = [...tabs].sort((a, b) => b.length - a.length);

  const dir = await resolveDir(path);
  const pagesByTab: Record<string, Record<number, string>> = {};
  const maxByTab: Record<string, number> = {};
  for (const t of tabs) { pagesByTab[t] = {}; maxByTab[t] = 0; }

  const entries = (dir as unknown as { entries: () => DirEntries }).entries();
  for await (const [name, handle] of entries) {
    if (handle.kind !== "file" || !name.endsWith(".md")) continue;
    for (const t of sortedTabs) {
      const prefix = `${t} - Page `;
      if (name.startsWith(prefix)) {
        const numStr = name.slice(prefix.length, -3);
        if (/^\d+$/.test(numStr)) {
          const n = parseInt(numStr, 10);
          if (n >= 1) {
            const file = await (handle as FileSystemFileHandle).getFile();
            pagesByTab[t][n - 1] = await file.text();
            if (n > maxByTab[t]) maxByTab[t] = n;
          }
        }
        break;
      }
    }
  }

  return {
    tabs: tabs.map((t) => {
      const max = maxByTab[t];
      const pages: string[] = [];
      for (let i = 0; i < max; i++) pages.push(pagesByTab[t][i] ?? "");
      return { name: t, pages };
    }),
  };
}

export async function writeDocPage(
  docId: string,
  tabName: string,
  pageIndex: number,
  content: string,
): Promise<void> {
  const path = pathOf(docId);
  const dir = await resolveDir(path, true);
  const fileName = pageFileName(tabName, pageIndex);
  if (content.trim() === "") {
    try { await dir.removeEntry(fileName); } catch { /* not present */ }
  } else {
    const fh = await dir.getFileHandle(fileName, { create: true });
    const w = await fh.createWritable();
    await w.write(content);
    await w.close();
  }
}

export async function renameDocTab(docId: string, oldName: string, newName: string): Promise<boolean> {
  const clean = sanitizeName(newName);
  if (!clean || clean === oldName) return false;
  const path = pathOf(docId);
  const meta = _sidecar.docs[path];
  if (!meta) return false;
  if (meta.tabs.includes(clean)) return false;

  const dir = await resolveDir(path);
  const prefix = `${oldName} - Page `;
  const toRename: string[] = [];
  const entries = (dir as unknown as { entries: () => DirEntries }).entries();
  for await (const [name, handle] of entries) {
    if (handle.kind === "file" && name.startsWith(prefix) && name.endsWith(".md")) {
      toRename.push(name);
    }
  }
  for (const oldFile of toRename) {
    const suffix = oldFile.slice(oldName.length); // " - Page N.md"
    const newFile = clean + suffix;
    try {
      const fh = await dir.getFileHandle(oldFile);
      const withMove = fh as FileSystemFileHandle & { move?: (n: string) => Promise<void> };
      if (typeof withMove.move === "function") {
        await withMove.move(newFile);
      } else {
        const file = await fh.getFile();
        const text = await file.text();
        const nfh = await dir.getFileHandle(newFile, { create: true });
        const w = await nfh.createWritable();
        await w.write(text);
        await w.close();
        await dir.removeEntry(oldFile);
      }
    } catch (e) { console.error(e); }
  }

  meta.tabs = meta.tabs.map((t) => (t === oldName ? clean : t));
  _sidecar.docs[path] = meta;
  scheduleSidecarWrite();
  notify();
  return true;
}

export async function setDocTabs(docId: string, tabs: string[]): Promise<void> {
  const path = pathOf(docId);
  const cur = _sidecar.docs[path] ?? { tabs: [] };
  const cleaned = tabs.map(sanitizeName);
  const removed = cur.tabs.filter((t) => !cleaned.includes(t));
  _sidecar.docs[path] = { tabs: cleaned };
  scheduleSidecarWrite();
  notify();
  if (removed.length) {
    try {
      const dir = await resolveDir(path);
      for (const t of removed) {
        const prefix = `${t} - Page `;
        const toDelete: string[] = [];
        const entries = (dir as unknown as { entries: () => DirEntries }).entries();
        for await (const [name, handle] of entries) {
          if (handle.kind === "file" && name.startsWith(prefix) && name.endsWith(".md")) {
            toDelete.push(name);
          }
        }
        for (const f of toDelete) {
          try { await dir.removeEntry(f); } catch { /* ignore */ }
        }
      }
    } catch (e) { console.error(e); }
  }
}

// ---------- Views ----------
function genId(): string {
  return (typeof crypto !== "undefined" && "randomUUID" in crypto)
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function createView(name: string): string {
  const id = genId();
  _views = [..._views, { id, name, itemIds: [] }];
  _sidecar.views = [..._sidecar.views, { id, name, itemIds: [] }];
  notify(); scheduleSidecarWrite();
  return id;
}

export function updateView(id: string, patch: Partial<Omit<View, "id">>) {
  _views = _views.map((v) => (v.id === id ? { ...v, ...patch } : v));
  _sidecar.views = _sidecar.views.map((v) => (v.id === id ? { ...v, ...patch } : v));
  notify(); scheduleSidecarWrite();
}

export function deleteView(id: string) {
  _views = _views.filter((v) => v.id !== id);
  _sidecar.views = _sidecar.views.filter((v) => v.id !== id);
  notify(); scheduleSidecarWrite();
}

export function addItemToView(viewId: string, itemId: string) {
  const v = _views.find((x) => x.id === viewId);
  if (!v || v.itemIds.includes(itemId)) return;
  _views = _views.map((x) => (x.id === viewId ? { ...x, itemIds: [...x.itemIds, itemId] } : x));
  _sidecar.views = _sidecar.views.map((x) => (x.id === viewId ? { ...x, itemIds: [...x.itemIds, itemId] } : x));
  notify(); scheduleSidecarWrite();
}

export function removeItemFromView(viewId: string, itemId: string) {
  _views = _views.map((x) => (x.id === viewId ? { ...x, itemIds: x.itemIds.filter((i) => i !== itemId) } : x));
  _sidecar.views = _sidecar.views.map((x) => (x.id === viewId ? { ...x, itemIds: x.itemIds.filter((i) => i !== itemId) } : x));
  notify(); scheduleSidecarWrite();
}
