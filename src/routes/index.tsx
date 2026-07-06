import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  FilePlus2, FolderPlus, Folder, FileText, ChevronRight, Trash2,
  MoreHorizontal, Star, Plus, Home, X, FolderOpen,
} from "lucide-react";

import {
  addItemToView,
  createDoc,
  createFolder,
  createView,
  deleteItem,
  deleteView,
  FOLDER_COLORS,
  getBreadcrumb,
  pickFolder,
  readDocPreview,
  removeItemFromView,
  reorderItem,
  updateItem,
  updateView,
  useItems,
  useRootName,
  useViews,
  type Item,
  type View,
} from "@/lib/storage";

import { Button } from "@/components/ui/button";
import { FolderGate } from "@/components/FolderGate";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";

type Search = { folder?: string; view?: string };

export const Route = createFileRoute("/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    folder: typeof s.folder === "string" ? s.folder : undefined,
    view: typeof s.view === "string" ? s.view : undefined,
  }),
  component: () => (
    <FolderGate>
      <Browser />
    </FolderGate>
  ),
});

function Browser() {
  const { folder, view } = Route.useSearch();
  const items = useItems();
  const views = useViews();
  const navigate = useNavigate();
  const currentFolder = folder ?? null;
  const isStarred = view === "starred";
  const activeView = view && view !== "starred" ? views.find((v) => v.id === view) : undefined;
  const isCustomView = !!activeView;
  const trail = React.useMemo(() => getBreadcrumb(currentFolder), [items, currentFolder]);
  const visible = isStarred
    ? items.filter((i) => i.starred)
    : isCustomView
    ? items.filter((i) => activeView!.itemIds.includes(i.id))
    : items.filter((i) => i.parentId === currentFolder);
  const [dragId, setDragId] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<{ id: string; position: "before" | "after" } | null>(null);

  const [editingViewId, setEditingViewId] = React.useState<string | null>(null);
  const [editingViewName, setEditingViewName] = React.useState("");

  const disableCreate = isStarred;

  const backSearch = isStarred
    ? { view: "starred" as const }
    : isCustomView
      ? { view: activeView!.id }
      : currentFolder
        ? { folder: currentFolder }
        : ({} as Record<string, never>);

  const handleNewDoc = () => {
    const id = createDoc(currentFolder);
    if (activeView) addItemToView(activeView.id, id);
    navigate({ to: "/doc/$id", params: { id }, search: backSearch });
  };

  const handleNewFolder = () => {
    const id = createFolder(currentFolder);
    if (activeView) addItemToView(activeView.id, id);
  };

  const handleAddView = () => {
    const nums = views.map((v) => {
      const m = v.name.match(/^View (\d+)$/);
      return m ? parseInt(m[1], 10) : 0;
    });
    const next = Math.max(0, ...nums) + 1;
    const name = `View ${next}`;
    const id = createView(name);
    setEditingViewId(id);
    setEditingViewName(name);
  };

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-60 shrink-0 border-r bg-muted/30 flex flex-col sticky top-0 h-screen">
        <div className="px-4 pt-4 pb-2 flex flex-col gap-2">
          <Button variant="outline" onClick={handleNewFolder} disabled={disableCreate}>
            <FolderPlus className="size-4" /> New folder
          </Button>
          <Button onClick={handleNewDoc} disabled={disableCreate}>
            <FilePlus2 className="size-4" /> New document
          </Button>
        </div>

        <div className="px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Views</h2>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
          <ViewButton
            icon={<Home className="size-4" />}
            label="Home"
            active={!isStarred && !currentFolder}
            onClick={() => navigate({ to: "/", search: {} })}
          />
          <ViewButton
            icon={<Star className="size-4" style={{ fill: "currentColor", fillOpacity: 0.3 }} />}
            label="Starred"
            active={isStarred}
            onClick={() => navigate({ to: "/", search: { view: "starred" } })}
          />
          {views.map((v) => (
            <ViewButton
              key={v.id}
              icon={<Folder className="size-4" />}
              label={v.name}
              active={view === v.id}
              onClick={() => navigate({ to: "/", search: { view: v.id } })}
              onDelete={() => {
                if (confirm(`Remove view "${v.name}"?`)) deleteView(v.id);
              }}
              isEditing={editingViewId === v.id}
              editName={editingViewName}
              onEditStart={() => {
                setEditingViewId(v.id);
                setEditingViewName(v.name);
              }}
              onEditChange={setEditingViewName}
              onEditCommit={() => {
                const trimmed = editingViewName.trim();
                if (trimmed && trimmed !== v.name) updateView(v.id, { name: trimmed });
                setEditingViewId(null);
              }}
              onEditCancel={() => setEditingViewId(null)}
            />
          ))}
          <button
            onClick={handleAddView}
            className="w-full mt-1 flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Plus className="size-4" /> Add view
          </button>
        </nav>
      </aside>

      <div className="flex-1 min-w-0">
        <header className="border-b sticky top-0 z-10 bg-background/80 backdrop-blur">
          <div className="px-6 py-4 flex items-center justify-between gap-4">
            <div />
            <h1 className="text-xl font-semibold absolute left-1/2 -translate-x-1/2">Editaula</h1>
            <div className="flex items-center gap-2">
              <FolderMenu />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-6 py-6">
          {isStarred ? (
            <nav className="flex items-center gap-3 text-2xl text-muted-foreground mb-6 flex-wrap">
              <Star className="size-6" style={{ fill: "currentColor", fillOpacity: 0.3 }} />
              <span className="text-foreground">Starred</span>
            </nav>
          ) : isCustomView ? (
            <nav className="flex items-center gap-3 text-2xl text-muted-foreground mb-6 flex-wrap">
              <Folder className="size-6" />
              <span className="text-foreground">{activeView!.name}</span>
            </nav>
          ) : (
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
          )}

          {visible.length === 0 ? (
            <div className="text-center py-24 text-muted-foreground">
              {isStarred ? (
                <p>No starred items yet. Star a file or folder from its menu.</p>
              ) : (
                <>
                  <p className="mb-4">
                    {isCustomView ? "This view is empty." : "This folder is empty."}
                  </p>
                  <div className="flex justify-center gap-2">
                    <Button variant="outline" onClick={handleNewFolder}>
                      <FolderPlus /> New folder
                    </Button>
                    <Button onClick={handleNewDoc}>
                      <FilePlus2 /> New document
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4">
              {visible.map((item) => (
                <Tile
                  key={item.id}
                  item={item}
                  isDragging={dragId === item.id}
                  dropIndicator={dropTarget?.id === item.id ? dropTarget.position : null}
                  onDragStart={() => setDragId(item.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setDropTarget(null);
                  }}
                  onDragOverTile={(pos) => {
                    if (dragId && dragId !== item.id) {
                      setDropTarget({ id: item.id, position: pos });
                    }
                  }}
                  onDropTile={() => {
                    if (dragId && dragId !== item.id) {
                      reorderItem(dragId, item.id, dropTarget?.position ?? "before");
                    }
                    setDragId(null);
                    setDropTarget(null);
                  }}
                  onOpenFolder={(id) => navigate({ to: "/", search: { folder: id } })}
                  onOpenDoc={(id) => navigate({ to: "/doc/$id", params: { id }, search: backSearch })}
                  views={views}
                  activeViewId={activeView?.id}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function FolderMenu() {
  const rootName = useRootName();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <FolderOpen className="size-4" />
          <span className="max-w-[10rem] truncate">{rootName ?? "Folder"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="px-2 py-1.5">
          <div className="text-xs text-muted-foreground">Current folder</div>
          <div className="text-sm font-medium truncate">{rootName ?? "—"}</div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void pickFolder()}>
          <FolderOpen className="size-4" /> Change folder…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ViewButton({
  icon,
  label,
  active,
  onClick,
  onDelete,
  isEditing,
  editName,
  onEditStart,
  onEditChange,
  onEditCommit,
  onEditCancel,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
  isEditing?: boolean;
  editName?: string;
  onEditStart?: () => void;
  onEditChange?: (name: string) => void;
  onEditCommit?: () => void;
  onEditCancel?: () => void;
}) {
  return (
    <div
      className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm cursor-pointer transition-colors ${
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
      onClick={onClick}
      onDoubleClick={(e) => {
        if (onEditStart) {
          e.stopPropagation();
          onEditStart();
        }
      }}
    >
      <span className="shrink-0">{icon}</span>
      {isEditing ? (
        <input
          autoFocus
          value={editName ?? ""}
          onChange={(e) => onEditChange?.(e.target.value)}
          onBlur={onEditCommit}
          onKeyDown={(e) => {
            if (e.key === "Enter") onEditCommit?.();
            if (e.key === "Escape") onEditCancel?.();
          }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-transparent text-sm font-medium outline-none border-b border-primary"
        />
      ) : (
        <span className="flex-1 truncate">{label}</span>
      )}
      {onDelete && !isEditing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="size-5 inline-flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-background transition-opacity"
          aria-label="Remove view"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function Tile({
  item,
  onOpenFolder,
  onOpenDoc,
  isDragging,
  dropIndicator,
  onDragStart,
  onDragEnd,
  onDragOverTile,
  onDropTile,
  views,
  activeViewId,
}: {
  item: Item;
  onOpenFolder: (id: string) => void;
  onOpenDoc: (id: string) => void;
  isDragging: boolean;
  dropIndicator: "before" | "after" | null;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverTile: (pos: "before" | "after") => void;
  onDropTile: () => void;
  views: View[];
  activeViewId?: string;
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

  const isFolder = item.type === "folder";
  const folderColor = isFolder ? (item as Extract<Item, { type: "folder" }>).color : undefined;

  return (
    <div
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        onDragOverTile(e.clientX < midX ? "before" : "after");
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropTile();
      }}
      className={`relative group ${isDragging ? "opacity-40" : ""}`}
    >
      {dropIndicator && (
        <div
          className={`absolute top-0 bottom-0 w-1 rounded bg-primary ${
            dropIndicator === "before" ? "-left-1.5" : "-right-1.5"
          }`}
        />
      )}
      <button
        onClick={onActivate}
        onDoubleClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className="w-full aspect-[4/3] rounded-lg border bg-card hover:bg-accent/50 hover:shadow-sm transition-all flex flex-col items-center justify-center gap-2 p-4"
        style={isFolder ? { borderColor: folderColor, borderWidth: 2 } : undefined}
      >
        {isFolder ? (
          <Folder className="size-10" style={{ color: folderColor, fill: folderColor, fillOpacity: 0.15 }} />
        ) : (
          <FileText className="size-10 text-muted-foreground" />
        )}
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") { setEditing(false); setName(item.name); }
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-full text-center text-sm font-medium bg-transparent outline-none border-b border-primary"
          />
        ) : (
          <span className="text-sm font-medium text-center line-clamp-2 break-words">
            {item.name}
          </span>
        )}
      </button>

      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {item.starred && (
          <Star className="size-4 text-yellow-500" style={{ fill: "currentColor", fillOpacity: 0.8 }} />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="size-7 rounded-md bg-background/80 backdrop-blur border inline-flex items-center justify-center hover:bg-accent"
              aria-label="Actions"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                updateItem(item.id, { starred: !item.starred } as Partial<Item>)
              }
            >
              <Star className="size-4" /> {item.starred ? "Unstar" : "Star"}
            </DropdownMenuItem>
            {isFolder && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Color</DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="p-2">
                    <div className="grid grid-cols-5 gap-1.5">
                      {FOLDER_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => updateItem(item.id, { color: c } as Partial<Item>)}
                          className="size-6 rounded-md border"
                          style={{ background: c }}
                          aria-label={c}
                        />
                      ))}
                    </div>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            )}
            {views.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Add to view</DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    {views.map((v) => (
                      <DropdownMenuItem
                        key={v.id}
                        onSelect={() => addItemToView(v.id, item.id)}
                      >
                        {v.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            )}
            {activeViewId && (
              <DropdownMenuItem
                onSelect={() => removeItemFromView(activeViewId, item.id)}
              >
                Remove from view
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                if (confirm(`Delete "${item.name}"? This removes the file on disk.`)) {
                  deleteItem(item.id);
                }
              }}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="size-4" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
