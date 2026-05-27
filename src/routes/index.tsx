import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FilePlus2, FolderPlus, Folder, FileText, ChevronRight, Trash2, Pencil } from "lucide-react";
import {
  createDoc,
  createFolder,
  deleteItem,
  FOLDER_COLORS,
  getBreadcrumb,
  updateItem,
  useItems,
  type Item,
} from "@/lib/storage";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

type Search = { folder?: string };

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    folder: typeof s.folder === "string" ? s.folder : undefined,
  }),
  component: Browser,
});

function Browser() {
  const { folder } = Route.useSearch();
  const items = useItems();
  const navigate = useNavigate();
  const currentFolder = folder ?? null;
  const trail = React.useMemo(() => getBreadcrumb(currentFolder), [items, currentFolder]);
  const visible = items
    .filter((i) => i.parentId === currentFolder)
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const handleNewDoc = () => {
    const id = createDoc(currentFolder);
    navigate({ to: "/doc/$id", params: { id } });
  };

  const handleNewFolder = () => {
    createFolder(currentFolder);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b sticky top-0 z-10 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleNewFolder}>
              <FolderPlus /> New folder
            </Button>
            <Button onClick={handleNewDoc}>
              <FilePlus2 /> New document
            </Button>
          </div>
          <h1 className="text-xl font-semibold absolute left-1/2 -translate-x-1/2">Editaula</h1>
          <div className="w-[1px]" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        <nav className="flex items-center gap-3 text-2xl text-muted-foreground mb-6 flex-wrap">
          {trail.map((b, i) => (
            <React.Fragment key={b.id ?? "root"}>
              {i > 0 && <ChevronRight className="size-6" />}
              <button
                className="hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-accent"
                onClick={() =>
                  navigate({ to: "/", search: b.id ? { folder: b.id } : {} })
                }
              >
                {b.name}
              </button>
            </React.Fragment>
          ))}
        </nav>

        {visible.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <p className="mb-4">This folder is empty.</p>
            <div className="flex justify-center gap-2">
              <Button variant="outline" onClick={handleNewFolder}>
                <FolderPlus /> New folder
              </Button>
              <Button onClick={handleNewDoc}>
                <FilePlus2 /> New document
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,160px)] gap-4">
            {visible.map((item) => (
              <Tile key={item.id} item={item} onOpenFolder={(id) => navigate({ to: "/", search: { folder: id } })} onOpenDoc={(id) => navigate({ to: "/doc/$id", params: { id } })} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function Tile({
  item,
  onOpenFolder,
  onOpenDoc,
}: {
  item: Item;
  onOpenFolder: (id: string) => void;
  onOpenDoc: (id: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(item.name);
  React.useEffect(() => setName(item.name), [item.name]);

  const commitRename = () => {
    setEditing(false);
    const v = name.trim();
    if (v && v !== item.name) updateItem(item.id, { name: v } as Partial<Item>);
    else setName(item.name);
  };

  const onActivate = () => {
    if (editing) return;
    if (item.type === "folder") onOpenFolder(item.id);
    else onOpenDoc(item.id);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          onDoubleClick={onActivate}
          onClick={onActivate}
          className="group relative cursor-pointer rounded-xl border bg-card hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col w-[160px] h-[190px]"
        >
          <div className={`px-2.5 py-1.5 flex items-center gap-1.5 z-10 ${item.type === "doc" ? "border-b" : ""}`}>
            {item.type === "folder" ? (
              <Folder className="size-4 shrink-0" style={{ color: item.color }} />
            ) : (
              <FileText className="size-4 shrink-0 text-muted-foreground" />
            )}
            {editing ? (
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    setName(item.name);
                    setEditing(false);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-transparent text-sm font-medium outline-none border-b border-primary"
              />
            ) : (
              <span className="flex-1 text-sm font-medium truncate">{item.name}</span>
            )}
          </div>
          {item.type === "folder" ? (
            <FolderTile color={item.color} />
          ) : (
            <DocThumbnail content={item.content} />
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={() => setEditing(true)}>
          <Pencil className="size-4" /> Rename
        </ContextMenuItem>
        {item.type === "folder" && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <span
                className="size-4 rounded-full border"
                style={{ backgroundColor: item.color }}
              />
              Color
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <div className="grid grid-cols-4 gap-1.5 p-2">
                {FOLDER_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => updateItem(item.id, { color: c } as Partial<Item>)}
                    className="size-7 rounded-full border-2 border-transparent hover:border-foreground transition-colors"
                    style={{
                      backgroundColor: c,
                      borderColor: item.color === c ? "var(--foreground)" : undefined,
                    }}
                    aria-label={c}
                  />
                ))}
              </div>
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => {
            if (confirm(`Delete "${item.name}"${item.type === "folder" ? " and its contents" : ""}?`)) {
              deleteItem(item.id);
            }
          }}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="size-4" /> Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

function FolderTile({ color }: { color: string }) {
  return (
    <div
      className="flex-1 relative overflow-hidden"
      style={{
        background: `radial-gradient(120% 100% at 80% 20%, ${color}dd 0%, ${color} 60%, ${color}88 100%)`,
      }}
    >
      <div
        className="absolute inset-0 opacity-30"
        style={{
          background: `linear-gradient(160deg, transparent 40%, rgba(255,255,255,0.25) 60%, transparent 70%)`,
        }}
      />
    </div>
  );
}

function DocThumbnail({ content }: { content: string }) {
  // Show first ~12 lines plain-text preview
  const preview = content
    .split("\n")
    .slice(0, 14)
    .map((l) => l.replace(/^#+\s*/, ""))
    .join("\n");
  const firstHeading = content.split("\n").find((l) => l.startsWith("#"))?.replace(/^#+\s*/, "");
  return (
    <div className="flex-1 bg-white relative overflow-hidden">
      <div className="absolute inset-0 p-4 text-[7px] leading-[1.3] text-slate-700 font-mono whitespace-pre-wrap">
        {firstHeading && (
          <div className="text-[11px] font-bold text-slate-900 mb-1.5">{firstHeading}</div>
        )}
        {preview}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-transparent" />
    </div>
  );
}
