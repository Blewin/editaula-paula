import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FilePlus2, FolderPlus, Folder, FileText, ChevronRight, Trash2, MoreHorizontal, MoreVertical, Star, Home, Plus, X, LogOut, Download, Upload, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { randomBirdName } from "@/lib/birds";

import {
  addItemToView,
  createDoc,
  createDocWithContent,
  createFolder,
  createView,
  deleteItem,
  deleteView,
  reorderViews,
  FOLDER_COLORS,
  getBreadcrumb,
  removeItemFromView,
  reorderItem,
  updateItem,
  updateView,
  useItems,
  useViews,
  type Item,
  type View,
} from "@/lib/storage";

import { Button } from "@/components/ui/button";
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

function downloadBackup(items: Item[], views: View[]) {
  const viewsByItem = new Map<string, string[]>();
  for (const v of views) {
    for (const id of v.itemIds) {
      const arr = viewsByItem.get(id) ?? [];
      arr.push(v.name);
      viewsByItem.set(id, arr);
    }
  }
  const pathOf = (id: string | null): string => {
    if (!id) return "";
    const parts: string[] = [];
    let cur: string | null = id;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const f = items.find((i) => i.id === cur);
      if (!f) break;
      parts.unshift(f.name);
      cur = f.parentId;
    }
    return "/" + parts.join("/");
  };
  const exported = items.map((i) => ({
    id: i.id,
    type: i.type,
    name: i.name,
    path: pathOf(i.parentId),
    parentId: i.parentId,
    starred: !!i.starred,
    views: viewsByItem.get(i.id) ?? [],
    updatedAt: new Date(i.updatedAt).toISOString(),
    ...(i.type === "doc" ? { content: i.content } : { color: i.color }),
  }));
  const payload = {
    exportedAt: new Date().toISOString(),
    views: views.map((v) => ({ id: v.id, name: v.name, itemIds: v.itemIds })),
    items: exported,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  a.href = url;
  a.download = `editaula-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const Route = createFileRoute("/_authenticated/")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    folder: typeof s.folder === "string" ? s.folder : undefined,
    view: typeof s.view === "string" ? s.view : undefined,
  }),
  component: Browser,
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
  const [renamingHeader, setRenamingHeader] = React.useState(false);
  const [renamingHeaderName, setRenamingHeaderName] = React.useState("");

  const commitHeaderRename = () => {
    const trimmed = renamingHeaderName.trim();
    setRenamingHeader(false);
    if (!activeView || !trimmed || trimmed === activeView.name) return;
    updateView(activeView.id, { name: trimmed });
  };
  const [dragViewId, setDragViewId] = React.useState<string | null>(null);
  const [dropViewId, setDropViewId] = React.useState<string | null>(null);

  const disableCreate = isStarred;

  const backSearch = isStarred
    ? { view: "starred" as const }
    : isCustomView
      ? { view: activeView!.id }
      : currentFolder
        ? { folder: currentFolder }
        : ({} as Record<string, never>);

  const handleNewDoc = () => {
    const id = createDoc(currentFolder, randomBirdName(), activeView?.id);
    navigate({ to: "/doc/$id", params: { id }, search: backSearch });
  };

  const handleNewFolder = () => {
    createFolder(currentFolder, "New folder", activeView?.id);
  };


  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const handleUploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const text = await file.text();
      const name = file.name.replace(/\.(md|markdown|mdown|mkd|txt)$/i, "") || "Untitled";
      await createDocWithContent(currentFolder, name, text, activeView?.id);
    }
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
              active={!view}
              onClick={() => navigate({ to: "/", search: {} })}
            />
            <ViewButton
              icon={<Star className="size-4" />}
              label="Starred"
              active={isStarred}
              onClick={() => navigate({ to: "/", search: { view: "starred" } })}
            />
            {views.map((v) => (
              <ViewButton
                key={v.id}
                icon={<Eye className="size-4" />}
                label={v.name}
                active={view === v.id}
                onClick={() => navigate({ to: "/", search: { view: v.id } })}
                draggable
                isDragging={dragViewId === v.id}
                dropBefore={dropViewId === v.id}
                onDragStartView={() => setDragViewId(v.id)}
                onDragOverView={() => {
                  if (dragViewId && dragViewId !== v.id) setDropViewId(v.id);
                }}
                onDropView={() => {
                  if (dragViewId && dragViewId !== v.id) {
                    const ids = views.map((x) => x.id).filter((id) => id !== dragViewId);
                    const at = ids.indexOf(v.id);
                    ids.splice(at < 0 ? ids.length : at, 0, dragViewId);
                    reorderViews(ids);
                  }
                  setDragViewId(null);
                  setDropViewId(null);
                }}
                onDragEndView={() => {
                  setDragViewId(null);
                  setDropViewId(null);
                }}


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
              <Plus className="size-4" /> New view
            </button>
          </nav>
        </aside>

      <div className="flex-1 min-w-0">
        <header className="border-b sticky top-0 z-10 bg-background/80 backdrop-blur">
          <div className="px-6 py-4 flex items-center justify-between gap-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Menu">
                  <MoreVertical className="size-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem
                  onSelect={() => fileInputRef.current?.click()}
                  disabled={isStarred}
                >
                  <Upload className="size-4 mr-2" /> Upload
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => downloadBackup(items, views)}>
                  <Download className="size-4 mr-2" /> Download
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <h1 className="text-xl font-semibold absolute left-1/2 -translate-x-1/2">Editaula</h1>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain"
                multiple
                className="hidden"
                onChange={(e) => {
                  void handleUploadFiles(e.target.files);
                  e.target.value = "";
                }}
              />

              <UserMenu />
            </div>
          </div>
        </header>


        <main className="mx-auto max-w-6xl px-6 py-6">
          {isStarred ? (
            <nav className="flex items-center gap-3 text-2xl text-muted-foreground mb-6 flex-wrap">
              <Star className="size-6" />
              <span className="text-foreground">Starred</span>
            </nav>
          ) : isCustomView ? (
            <nav className="flex items-center gap-3 text-2xl text-muted-foreground mb-6 flex-wrap">
              <Eye className="size-6" />
              {renamingHeader ? (
                <input
                  autoFocus
                  value={renamingHeaderName}
                  onChange={(e) => setRenamingHeaderName(e.target.value)}
                  onBlur={commitHeaderRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitHeaderRename();
                    if (e.key === "Escape") setRenamingHeader(false);
                  }}
                  className="text-foreground bg-transparent outline-none border-b border-primary min-w-0 w-48"
                />
              ) : (
                <span
                  className="text-foreground cursor-text select-none"
                  title="Double-click to rename"
                  onDoubleClick={() => {
                    if (!activeView) return;
                    window.getSelection()?.removeAllRanges();
                    setRenamingHeaderName(activeView.name);
                    setRenamingHeader(true);
                  }}
                >
                  {activeView!.name}
                </span>
              )}
              <div className="flex items-center gap-1 ml-1">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="New folder in this view"
                  title="New folder in this view"
                  onClick={handleNewFolder}
                >
                  <FolderPlus className="size-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="New document in this view"
                  title="New document in this view"
                  onClick={handleNewDoc}
                >
                  <FilePlus2 className="size-5" />
                </Button>
              </div>
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

function UserMenu() {
  const navigate = useNavigate();
  const [user, setUser] = React.useState<{
    name?: string;
    email?: string;
    avatar?: string;
  } | null>(null);

  React.useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
      setUser({
        name: (meta.full_name as string) ?? (meta.name as string) ?? u.email ?? "",
        email: u.email ?? undefined,
        avatar: (meta.avatar_url as string) ?? (meta.picture as string) ?? undefined,
      });
    });
  }, []);

  const initial =
    (user?.name?.trim().charAt(0) || user?.email?.charAt(0) || "?").toUpperCase();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="size-9 rounded-full overflow-hidden border bg-muted flex items-center justify-center text-sm font-medium text-foreground hover:ring-2 hover:ring-ring transition"
          aria-label="Account menu"
        >
          {user?.avatar ? (
            <img src={user.avatar} alt="" className="size-full object-cover" />
          ) : (
            <span>{initial}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {user && (
          <>
            <div className="px-2 py-1.5">
              <div className="text-sm font-medium truncate">{user.name}</div>
              {user.email && (
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              )}
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={handleSignOut}>
          <LogOut className="size-4" /> Sign out
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
  draggable,
  isDragging,
  dropBefore,
  onDragStartView,
  onDragOverView,
  onDropView,
  onDragEndView,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  onDelete?: () => void;
  isEditing?: boolean;
  editName?: string;
  onEditStart?: () => void;
  onEditChange?: (name: string) => void;
  onEditCommit?: () => void;
  onEditCancel?: () => void;
  draggable?: boolean;
  isDragging?: boolean;
  dropBefore?: boolean;
  onDragStartView?: () => void;
  onDragOverView?: () => void;
  onDropView?: () => void;
  onDragEndView?: () => void;
}) {
  return (
    <div
      draggable={draggable && !isEditing}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", label);
        onDragStartView?.();
      }}
      onDragOver={(e) => {
        if (!onDragOverView) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOverView();
      }}
      onDrop={(e) => {
        if (!onDropView) return;
        e.preventDefault();
        onDropView();
      }}
      onDragEnd={() => onDragEndView?.()}
      className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm cursor-pointer transition-colors ${
        isDragging ? "opacity-40" : ""
      } ${dropBefore ? "ring-1 ring-primary/60" : ""} ${
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

  return (
    <div
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const rect = e.currentTarget.getBoundingClientRect();
        const pos = e.clientX - rect.left < rect.width / 2 ? "before" : "after";
        onDragOverTile(pos);
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropTile();
      }}
      
      onClick={onActivate}
      className={`group relative cursor-pointer border bg-card hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col ${item.type === "folder" ? "h-[72px] rounded-lg justify-center" : "h-[270px] rounded-xl"} ${
        isDragging ? "opacity-40" : ""
      } ${dropIndicator === "before" ? "ring-2 ring-primary ring-offset-2 ring-offset-background [box-shadow:-4px_0_0_0_var(--primary)]" : ""} ${dropIndicator === "after" ? "ring-2 ring-primary ring-offset-2 ring-offset-background [box-shadow:4px_0_0_0_var(--primary)]" : ""}`}
    >
      <div className={`flex items-center z-10 ${item.type === "folder" ? "px-3.5 py-3 gap-3" : "px-2.5 py-1.5 gap-1.5 border-b"}`}>
        {item.type === "folder" ? (
          <Folder
            className="size-8 shrink-0"
            style={{ color: item.color, fill: item.starred ? item.color : "none", fillOpacity: item.starred ? 0.25 : undefined }}
          />
        ) : (
          <FileText
            className="size-4 shrink-0 text-muted-foreground"
            style={item.starred ? { fill: "currentColor", fillOpacity: 0.18 } : undefined}
          />
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
          <span
            className="flex-1 text-sm font-medium truncate"
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
          >
            {item.name}
          </span>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              className="shrink-0 size-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              aria-label="More options"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-52"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenuItem
              onSelect={() => updateItem(item.id, { starred: !item.starred } as Partial<Item>)}
            >
              <Star
                className="size-4"
                style={item.starred ? { fill: "currentColor", fillOpacity: 0.3 } : undefined}
              />
              {item.starred ? "Unstar" : "Star"}
            </DropdownMenuItem>
            {item.type === "folder" && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <span
                    className="size-4 rounded-full border"
                    style={{ backgroundColor: item.color }}
                  />
                  Color
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <div className="grid grid-cols-5 gap-1.5 p-2">
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
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            )}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Plus className="size-4" /> Add to a view
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  {views.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No views yet</div>
                  ) : (
                    views.map((v) => {
                      const inView = v.itemIds.includes(item.id);
                      return (
                        <DropdownMenuItem
                          key={v.id}
                          onSelect={() =>
                            inView ? removeItemFromView(v.id, item.id) : addItemToView(v.id, item.id)
                          }
                        >
                          <Folder className="size-4" />
                          <span className="flex-1 truncate">{v.name}</span>
                          {inView && <Star className="size-3" style={{ fill: "currentColor" }} />}
                        </DropdownMenuItem>
                      );
                    })
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            {activeViewId && (
              <DropdownMenuItem onSelect={() => removeItemFromView(activeViewId, item.id)}>
                <X className="size-4" /> Remove from this view
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />

            <DropdownMenuItem
              onSelect={() => {
                if (confirm(`Delete "${item.name}"${item.type === "folder" ? " and its contents" : ""}?`)) {
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
      {item.type === "doc" && <DocThumbnail content={item.content} />}
    </div>
  );
}

const TABS_MARKER = "\u0001___TABS_V1___\u0001\n";
const SHEET_SEP = "\u0001___SHEET_BREAK___\u0001";

function extractPreviewText(content: string): string {
  let text = content;
  if (text.startsWith(TABS_MARKER)) {
    try {
      const tabs = JSON.parse(text.slice(TABS_MARKER.length));
      if (Array.isArray(tabs) && tabs.length > 0) {
        text = tabs[0]?.content ?? "";
      }
    } catch {
      // fall through with original
    }
  }
  // remove sheet separators
  return text.split("\n").filter((l) => l.trim() !== SHEET_SEP).join("\n");
}

function DocThumbnail({ content }: { content: string }) {
  const text = extractPreviewText(content);
  const lines = text.split("\n");
  const preview = lines
    .slice(0, 14)
    .map((l) => l.replace(/^#+\s*/, ""))
    .join("\n");
  const firstHeading = lines.find((l) => l.startsWith("#"))?.replace(/^#+\s*/, "");
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
