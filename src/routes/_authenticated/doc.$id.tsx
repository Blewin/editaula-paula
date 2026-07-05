import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlignJustify, ArrowLeft, CornerDownLeft, FileText, Plus } from "lucide-react";
import { getItem, updateItem, useItems, type Item } from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { SheetEditor } from "@/components/SheetEditor";

type DocSearch = { view?: string; folder?: string };

export const Route = createFileRoute("/_authenticated/doc/$id")({
  validateSearch: (s: Record<string, unknown>): DocSearch => ({
    view: typeof s.view === "string" ? s.view : undefined,
    folder: typeof s.folder === "string" ? s.folder : undefined,
  }),
  component: DocEditor,
});

const SEP = "\u0001___SHEET_BREAK___\u0001";
const TABS_MARKER = "\u0001___TABS_V1___\u0001\n";

type Tab = { name: string; content: string };
type PageLayout = "grid4" | "grid6" | "verticalAll";

function parseTabs(content: string): Tab[] {
  if (content.startsWith(TABS_MARKER)) {
    try {
      const data = JSON.parse(content.slice(TABS_MARKER.length));
      if (Array.isArray(data) && data.length > 0) return data as Tab[];
    } catch {
      // fall through
    }
  }
  return [{ name: "Tab 1", content }];
}

function serializeTabs(tabs: Tab[]): string {
  return TABS_MARKER + JSON.stringify(tabs);
}

function splitSheets(content: string): string[] {
  const parts = content.split("\n" + SEP + "\n");
  while (parts.length < 2) parts.push("");
  return parts;
}

function joinSheets(sheets: string[]): string {
  return sheets.join("\n" + SEP + "\n");
}

function TabItem({
  name,
  isActive,
  onSelect,
  onRename,
}: {
  name: string;
  isActive: boolean;
  onSelect: () => void;
  onRename: (newName: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(name);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  React.useEffect(() => {
    if (!editing) setDraft(name);
  }, [name, editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) onRename(trimmed);
    else setDraft(name);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            setDraft(name);
            setEditing(false);
          }
        }}
        className={`text-left text-sm px-3 py-2 rounded-md outline-none ${
          isActive ? "font-medium" : ""
        }`}
      />
    );
  }

  return (
    <button
      onClick={() => {
        if (isActive) setEditing(true);
        else onSelect();
      }}
      onDoubleClick={() => setEditing(true)}
      className={`text-left text-sm px-3 py-2 rounded-md truncate transition-colors ${
        isActive
          ? "bg-accent text-accent-foreground font-medium"
          : "hover:bg-muted text-muted-foreground"
      }`}
      title="Click active tab or double-click to rename"
    >
      {name}
    </button>
  );
}

function Grid4Icon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="12" y1="3" x2="12" y2="21" />
    </svg>
  );
}

function DocEditor() {
  const { id } = Route.useParams();
  const { view: fromView, folder: fromFolder } = Route.useSearch();
  const navigate = useNavigate();
  useItems(); // subscribe for reactivity
  const doc = getItem(id);

  const [name, setName] = React.useState(doc?.name ?? "");
  const initialTabs = React.useMemo(
    () => (doc && doc.type === "doc" ? parseTabs(doc.content) : [{ name: "Tab 1", content: "" }]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );
  const [tabs, setTabs] = React.useState<Tab[]>(initialTabs);
  const [activeTab, setActiveTab] = React.useState(0);
  const [sheets, setSheets] = React.useState<string[]>(splitSheets(initialTabs[0].content));
  const [activeSheet, setActiveSheet] = React.useState(0);
  const [view, setView] = React.useState<"document" | "tiles">("document");
  const [pageLayout, setPageLayout] = React.useState<PageLayout>("verticalAll");
  const mainRef = React.useRef<HTMLElement>(null);
  const [tabsVisible, setTabsVisible] = React.useState(true);

  React.useEffect(() => {
    if (doc) {
      setName(doc.name);
      if (doc.type === "doc") {
        const t = parseTabs(doc.content);
        setTabs(t);
        setActiveTab(0);
        setSheets(splitSheets(t[0].content));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const tabsWithCurrent = React.useMemo(() => {
    const next = [...tabs];
    if (next[activeTab]) {
      next[activeTab] = { ...next[activeTab], content: joinSheets(sheets) };
    }
    return next;
  }, [tabs, activeTab, sheets]);

  React.useEffect(() => {
    if (!doc || doc.type !== "doc") return;
    const t = setTimeout(() => {
      const content = serializeTabs(tabsWithCurrent);
      if (name !== doc.name || content !== doc.content) {
        updateItem(id, { name, content } as Partial<Item>);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [name, tabsWithCurrent, id, doc]);

  const switchTab = (idx: number) => {
    if (idx === activeTab) return;
    const committed = [...tabs];
    if (committed[activeTab]) {
      committed[activeTab] = { ...committed[activeTab], content: joinSheets(sheets) };
    }
    setTabs(committed);
    setActiveTab(idx);
    setSheets(splitSheets(committed[idx]?.content ?? ""));
    setActiveSheet(0);
  };

  const addTab = () => {
    const committed = [...tabs];
    if (committed[activeTab]) {
      committed[activeTab] = { ...committed[activeTab], content: joinSheets(sheets) };
    }
    const newTab: Tab = { name: `Tab ${committed.length + 1}`, content: "" };
    const next = [...committed, newTab];
    setTabs(next);
    setActiveTab(next.length - 1);
    setSheets(splitSheets(""));
    setActiveSheet(0);
  };

  const renameTab = (idx: number, newName: string) => {
    const next = [...tabs];
    if (!next[idx]) return;
    next[idx] = { ...next[idx], name: newName };
    setTabs(next);
  };

  const cyclePageLayout = () => {
    const nextLayout: PageLayout =
      pageLayout === "verticalAll"
        ? "grid4"
        : pageLayout === "grid4"
          ? "grid6"
          : "verticalAll";
    const minimumPages = nextLayout === "grid4" ? 4 : nextLayout === "grid6" ? 6 : 2;
    setSheets((current) => {
      const next = [...current];
      while (next.length < minimumPages) next.push("");
      return next;
    });
    setPageLayout(nextLayout);
  };

  const isGridLayout = pageLayout === "grid4" || pageLayout === "grid6";
  const lastWrittenSheet = sheets.reduce((last, sheet, index) =>
    sheet.trim().length > 0 ? index : last, -1);
  const visiblePageCount =
    pageLayout === "grid4"
      ? 4
      : pageLayout === "grid6"
        ? 6
        : pageLayout === "verticalAll"
          ? Math.max(2, lastWrittenSheet + 1)
          : 2;

  const pageBorderRadius = (s: number) => {
    if (isGridLayout) {
      if (s === 0) return "rounded-tl-lg";
      if (s === 1) return "rounded-tr-lg";
      if (s === visiblePageCount - 2) return "rounded-bl-lg";
      if (s === visiblePageCount - 1) return "rounded-br-lg";
      return "rounded-none";
    }
    if (s === 0) return "rounded-t-lg rounded-b-none";
    if (s === visiblePageCount - 1) return "rounded-t-none rounded-b-lg";
    return "rounded-none";
  };

  if (!doc || doc.type !== "doc") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="mb-4 text-muted-foreground">Document not found.</p>
          <Button onClick={() => navigate({ to: "/" })}>Back to home</Button>
        </div>
      </div>
    );
  }

  const writeSheet = (s: number, next: string) => {
    setSheets((cur) => {
      if ((cur[s] ?? "") === next) return cur;
      const copy = [...cur];
      copy[s] = next;
      return copy;
    });
  };

  const selectAllAcrossSheets = (): boolean => {
    if (!mainRef.current) return false;
    (document.activeElement as HTMLElement | null)?.blur();
    const range = document.createRange();
    range.selectNodeContents(mainRef.current);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    return true;
  };

  const renderSheet = (s: number) => {
    const borderRadius = pageBorderRadius(s);
    return (
      <div
        key={s}
        className={`relative w-full min-h-[calc(50vh-6rem)] border bg-card p-4 ${borderRadius}`}
      >
        <SheetEditor
          value={sheets[s] ?? ""}
          onChange={(v) => writeSheet(s, v)}
          onFocus={() => setActiveSheet(s)}
          onSelectAll={selectAllAcrossSheets}
          className="min-h-[calc(50vh-8rem)]"
        />
        <span className="pointer-events-none absolute bottom-2 right-3 text-xs text-muted-foreground/60 select-none">
          {s + 1}
        </span>
      </div>
    );
  };



  const splitParagraphs = (s: string): string[] => {
    return s.split("\n").filter((p) => p.trim().length > 0);
  };
  const joinParagraphs = (ps: string[]): string => ps.join("\n");

  const moveParagraph = (fromSheet: number, fromIdx: number, toSheet: number, toIdx: number) => {
    if (fromSheet === toSheet && fromIdx === toIdx) return;
    const next = [...sheets];
    const srcPs = splitParagraphs(next[fromSheet] ?? "");
    if (fromIdx < 0 || fromIdx >= srcPs.length) return;
    const [moved] = srcPs.splice(fromIdx, 1);
    if (fromSheet === toSheet) {
      srcPs.splice(Math.max(0, Math.min(toIdx, srcPs.length)), 0, moved);
      next[fromSheet] = joinParagraphs(srcPs);
    } else {
      const dstPs = splitParagraphs(next[toSheet] ?? "");
      dstPs.splice(Math.max(0, Math.min(toIdx, dstPs.length)), 0, moved);
      next[fromSheet] = joinParagraphs(srcPs);
      next[toSheet] = joinParagraphs(dstPs);
    }
    setSheets(next);
  };

  const renderTiles = (s: number) => {
    const paragraphs = splitParagraphs(sheets[s] ?? "");
    const borderRadius = pageBorderRadius(s);
    return (
      <div
        key={s}
        className={`relative w-full min-h-[calc(50vh-6rem)] border bg-card p-4 ${borderRadius}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          e.preventDefault();
          const raw = e.dataTransfer.getData("text/plain");
          if (!raw) return;
          try {
            const { sheet: fromSheet, index: fromIdx } = JSON.parse(raw);
            if (typeof fromSheet === "number" && typeof fromIdx === "number") {
              const dstLen = splitParagraphs(sheets[s] ?? "").length;
              moveParagraph(fromSheet, fromIdx, s, dstLen);
            }
          } catch {
            // ignore
          }
        }}
      >
        {paragraphs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No paragraphs yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {paragraphs.map((p, i) => (
              <div
                key={i}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", JSON.stringify({ sheet: s, index: i }));
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const raw = e.dataTransfer.getData("text/plain");
                  if (!raw) return;
                  try {
                    const { sheet: fromSheet, index: fromIdx } = JSON.parse(raw);
                    if (typeof fromSheet === "number" && typeof fromIdx === "number") {
                      moveParagraph(fromSheet, fromIdx, s, i);
                    }
                  } catch {
                    // ignore
                  }
                }}
                className="cursor-move w-full rounded-md border bg-background px-4 py-2 text-sm leading-snug shadow-sm hover:shadow-md transition-shadow whitespace-pre-wrap break-words"
              >
                {p}
              </div>
            ))}
          </div>
        )}
        <span className="pointer-events-none absolute bottom-2 right-3 text-xs text-muted-foreground/60 select-none">
          {s + 1}
        </span>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b sticky top-0 z-20 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-4xl px-6 py-3 flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (fromView) {
                navigate({ to: "/", search: { view: fromView } });
              } else if (fromFolder) {
                navigate({ to: "/", search: { folder: fromFolder } });
              } else {
                navigate({
                  to: "/",
                  search: doc.parentId ? { folder: doc.parentId } : {},
                });
              }
            }}
          >
            <ArrowLeft />
          </Button>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 bg-transparent text-lg font-semibold outline-none"
            placeholder="Untitled"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => setView(view === "document" ? "tiles" : "document")}
            title={view === "document" ? "Switch to tiles view" : "Switch to document view"}
          >
            {view === "document" ? <AlignJustify /> : <FileText />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={cyclePageLayout}
            title={
              pageLayout === "verticalAll"
                ? "Show 4 pages"
                : pageLayout === "grid4"
                  ? "Show 6 pages"
                  : "Show all written pages vertically"
            }
          >
            <Grid4Icon className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex-1 mx-auto w-full px-6 py-4 relative max-w-4xl">
        <button
          onClick={() => setTabsVisible((v) => !v)}
          className="absolute left-6 top-8 z-10 h-8 w-8 inline-flex items-center justify-center rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-sm transition-colors"
          title={tabsVisible ? "Hide tabs" : "Show tabs"}
          aria-label={tabsVisible ? "Hide tabs" : "Show tabs"}
        >
          <CornerDownLeft className={`h-4 w-4 transition-transform ${tabsVisible ? "" : "rotate-180"}`} />
        </button>

        <div className="flex gap-4">
          {tabsVisible && (
            <aside className="w-44 shrink-0 pt-16">
              <Button
                variant="outline"
                className="w-full justify-start gap-2 mb-1.5 text-sm py-2"
                onClick={addTab}
              >
                <Plus className="h-4 w-4" />
                New tab
              </Button>
              <nav className="flex flex-col gap-1.5">

                {tabs.map((t, i) => (
                  <TabItem
                    key={i}
                    name={t.name}
                    isActive={i === activeTab}
                    onSelect={() => switchTab(i)}
                    onRename={(newName) => renameTab(i, newName)}
                  />
                ))}
              </nav>
            </aside>
          )}

          <main
            ref={mainRef}
            className={`min-w-0 ${isGridLayout ? "grid grid-cols-2 gap-[4px]" : "flex flex-col gap-[4px]"} ${
              tabsVisible ? "flex-1" : "mx-auto w-full max-w-[calc(48rem-3rem)]"
            }`}
          >
            {sheets.slice(0, visiblePageCount).map((_, s) =>
              view === "document" ? renderSheet(s) : renderTiles(s),
            )}
          </main>
        </div>
      </div>

    </div>
  );
}
