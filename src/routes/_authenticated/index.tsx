import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { FilePlus2, FolderPlus, Folder, FileText, ChevronRight, Trash2, MoreHorizontal, Star, Plus, Home, X, LogOut, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import {
  addItemToView,
  createDoc,
  createFolder,
  createView,
  deleteItem,
  deleteView,
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
              <Button variant="outline" size="sm" onClick={() => downloadBackup(items, views)}>
                <Download className="size-4" /> Download
              </Button>
              <UserMenu />
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
              ) : isCustomView ? (
                <p>Add files or folders to this view.</p>
              ) : (
                <>
                  <p className="mb-4">This folder is empty.</p>
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
      className={`group relative cursor-pointer rounded-xl border bg-card hover:shadow-md hover:-translate-y-0.5 transition-all overflow-hidden flex flex-col h-[270px] ${
        isDragging ? "opacity-40" : ""
      } ${dropIndicator === "before" ? "ring-2 ring-primary ring-offset-2 ring-offset-background [box-shadow:-4px_0_0_0_var(--primary)]" : ""} ${dropIndicator === "after" ? "ring-2 ring-primary ring-offset-2 ring-offset-background [box-shadow:4px_0_0_0_var(--primary)]" : ""}`}
    >
      <div className={`px-2.5 py-1.5 flex items-center gap-1.5 z-10 ${item.type === "doc" ? "border-b" : ""}`}>
        {item.type === "folder" ? (
          <Folder
            className="size-4 shrink-0"
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
      {item.type === "folder" ? (
        <FolderTile color={item.color} />
      ) : (
        <DocThumbnail content={item.content} />
      )}
    </div>
  );
}

function shiftHue(hex: string, degrees: number, lightDelta = 0): string {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      default:
        h = ((r - g) / d + 4) * 60;
    }
  }
  const nh = (h + degrees + 360) % 360;
  const nl = Math.max(0, Math.min(1, l + lightDelta));
  return `hsl(${nh.toFixed(1)}, ${(s * 100).toFixed(1)}%, ${(nl * 100).toFixed(1)}%)`;
}

function getHue(hex: string): number {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16) / 255;
  const g = parseInt(m.slice(2, 4), 16) / 255;
  const b = parseInt(m.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
    case g: h = ((b - r) / d + 2) * 60; break;
    default: h = ((r - g) / d + 4) * 60;
  }
  return h;
}

function FolderTile({ color }: { color: string }) {
  const hue = getHue(color);
  // Yellows/ambers (~35-75°) blow out into near-white when lightened; dampen the contrast there.
  const isYellow = hue >= 35 && hue <= 75;
  const k = isYellow ? 0.4 : 1;
  const warm = shiftHue(color, 25 * k, 0.08 * k);
  const cool = shiftHue(color, -30 * k, -0.12 * k);
  const overlayWarm = shiftHue(color, 40 * k, 0.15 * k);
  const overlayCool = shiftHue(color, -50 * k, -0.18 * k);
  return (
    <div
      className="flex-1 relative overflow-hidden"
      style={{
        background: `radial-gradient(130% 110% at 78% 18%, ${warm} 0%, ${color} 55%, ${cool} 100%)`,
      }}
    >
      <div
        className="absolute inset-0 mix-blend-overlay opacity-40"
        style={{
          background: `linear-gradient(160deg, ${overlayWarm} 0%, transparent 55%, ${overlayCool} 100%)`,
        }}
      />
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
