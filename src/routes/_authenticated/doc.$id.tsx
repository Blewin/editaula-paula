import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlignJustify, ArrowLeft, CornerDownLeft, FileText, Plus, Trash2 } from "lucide-react";
import { getItem, updateItem, useItems, type Item } from "@/lib/storage";
import { renderLine } from "@/lib/markdown";
import { Button } from "@/components/ui/button";

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
type PageLayout = "grid" | "verticalAll";

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
  const [active, setActive] = React.useState<{ sheet: number; line: number }>({
    sheet: 0,
    line: 0,
  });
  const [caretPos, setCaretPos] = React.useState<number | null>(null);
  const [view, setView] = React.useState<"document" | "tiles">("document");
  const [pageLayout, setPageLayout] = React.useState<PageLayout>("verticalAll");
  const inputRef = React.useRef<HTMLDivElement>(null);
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
    setActive({ sheet: 0, line: 0 });
    setCaretPos(0);
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
    setActive({ sheet: 0, line: 0 });
    setCaretPos(0);
  };

  const renameTab = (idx: number, newName: string) => {
    const next = [...tabs];
    if (!next[idx]) return;
    next[idx] = { ...next[idx], name: newName };
    setTabs(next);
  };

  const addSheet = () => {
    // In grid mode, add two pages at a time to keep the 2-col layout balanced.
    const toAdd = pageLayout === "grid" ? 2 : 1;
    const next = [...sheets];
    for (let i = 0; i < toAdd; i++) next.push("");
    setSheets(next);
    setActive({ sheet: sheets.length, line: 0 });
    setCaretPos(0);
  };

  const deleteSheet = (s: number) => {
    if (!window.confirm(`Delete page ${s + 1}? This cannot be undone.`)) return;
    const next = sheets.filter((_, i) => i !== s);
    if (next.length === 0) next.push("");
    setSheets(next);
    const newActiveSheet = active.sheet >= 0 ? Math.min(active.sheet, next.length - 1) : -1;
    setActive({ sheet: newActiveSheet, line: newActiveSheet >= 0 ? 0 : -1 });
    setCaretPos(0);
  };


  const cyclePageLayout = () => {
    const nextLayout: PageLayout = pageLayout === "verticalAll" ? "grid" : "verticalAll";
    if (nextLayout === "grid") {
      setSheets((current) => {
        const next = [...current];
        while (next.length < 4) next.push("");
        if (next.length % 2 !== 0) next.push("");
        return next;
      });
    }
    setPageLayout(nextLayout);
  };

  const isGridLayout = pageLayout === "grid";
  const visiblePageCount = isGridLayout
    ? Math.max(4, sheets.length + (sheets.length % 2))
    : Math.max(2, sheets.length);

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

  // Caret helpers for contentEditable line
  const setCaretInEl = (el: HTMLElement, offset: number) => {
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    const first = el.firstChild;
    if (first && first.nodeType === 3) {
      const len = first.textContent?.length ?? 0;
      range.setStart(first, Math.max(0, Math.min(offset, len)));
    } else {
      range.setStart(el, 0);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const getCaretInEl = (el: HTMLElement): number => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return (el.textContent ?? "").length;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.endContainer)) return (el.textContent ?? "").length;
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.endContainer, range.endOffset);
    return pre.toString().length;
  };

  // Keep the editable line aligned with the model after programmatic changes.
  // The line text is also rendered directly below so it is never blank while
  // effects wait to run after a view switch.
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el || active.sheet < 0 || active.line < 0) return;
    const sheetContent = sheets[active.sheet] ?? "";
    const linesArr = sheetContent.length === 0 ? [""] : sheetContent.split("\n");
    const target = linesArr[active.line] ?? "";
    if (el.textContent !== target) el.textContent = target;
  }, [active, sheets, view]);

  // Focus active line and place caret
  React.useEffect(() => {
    if (view !== "document") return;
    if (active.sheet < 0 || active.line < 0) return;
    const el = inputRef.current;
    if (!el) return;
    if (document.activeElement !== el) el.focus();
    if (caretPos !== null) {
      setCaretInEl(el, caretPos);
      setCaretPos(null);
    }
  }, [active, caretPos, view]);

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

  const sheetLines = (s: number): string[] => {
    const c = sheets[s] ?? "";
    return c.length === 0 ? [""] : c.split("\n");
  };

  const writeSheet = (s: number, nextLines: string[]) => {
    const next = [...sheets];
    next[s] = nextLines.join("\n");
    setSheets(next);
  };

  const setLinesAndActive = (
    s: number,
    nextLines: string[],
    newLine: number,
    newCaret: number | null = null,
  ) => {
    writeSheet(s, nextLines);
    setActive({ sheet: s, line: newLine });
    if (newCaret !== null) setCaretPos(newCaret);
  };

  const focusLine = (s: number, idx: number, caret: number | null = null) => {
    const lines = sheetLines(s);
    const safeIdx = Math.max(0, Math.min(idx, lines.length - 1));
    setActive({ sheet: s, line: safeIdx });
    setCaretPos(caret ?? lines[safeIdx].length);
  };

  const pageMinHeight = (s: number): string => {
    const isFirstRow = pageLayout === "verticalAll" ? s === 0 : s <= 1;
    return isFirstRow ? "min-h-[75vh]" : "min-h-[25vh]";
  };

  const renderSheet = (s: number) => {

    const lines = sheetLines(s);
    const isActiveSheet = active.sheet === s;
    const safeActive = isActiveSheet ? Math.min(active.line, lines.length - 1) : -1;

    const onLineChange = (val: string) => {
      if (val.includes("\n")) {
        const parts = val.split("\n");
        const next = [...lines];
        next.splice(safeActive, 1, ...parts);
        setLinesAndActive(s, next, safeActive + parts.length - 1, parts[parts.length - 1].length);
        return;
      }
      const next = [...lines];
      next[safeActive] = val;
      writeSheet(s, next);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const val = el.textContent ?? "";
      const pos = getCaretInEl(el);

      // Select all across current tab's pages
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && !e.shiftKey && !e.altKey) {
        if (mainRef.current) {
          e.preventDefault();
          (document.activeElement as HTMLElement | null)?.blur();
          const range = document.createRange();
          range.selectNodeContents(mainRef.current);
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const before = val.slice(0, pos);
        const after = val.slice(pos);
        const next = [...lines];
        next.splice(safeActive, 1, before, after);
        setLinesAndActive(s, next, safeActive + 1, 0);
        return;
      }
      if (e.key === "Backspace" && pos === 0 && safeActive > 0) {
        e.preventDefault();
        const prev = lines[safeActive - 1];
        const next = [...lines];
        next.splice(safeActive - 1, 2, prev + val);
        setLinesAndActive(s, next, safeActive - 1, prev.length);
        return;
      }
      if (e.key === "ArrowUp") {
        if (safeActive > 0) {
          e.preventDefault();
          setCaretPos(Math.min(pos, lines[safeActive - 1].length));
          setActive({ sheet: s, line: safeActive - 1 });
        } else if (s > 0) {
          e.preventDefault();
          const prev = sheetLines(s - 1);
          setCaretPos(Math.min(pos, prev[prev.length - 1].length));
          setActive({ sheet: s - 1, line: prev.length - 1 });
        }
        return;
      }
      if (e.key === "ArrowDown") {
        if (safeActive < lines.length - 1) {
          e.preventDefault();
          setCaretPos(Math.min(pos, lines[safeActive + 1].length));
          setActive({ sheet: s, line: safeActive + 1 });
        } else if (s < sheets.length - 1) {
          e.preventDefault();
          const nextLines = sheetLines(s + 1);
          setCaretPos(Math.min(pos, nextLines[0].length));
          setActive({ sheet: s + 1, line: 0 });
        }
        return;
      }
      if (e.key === "ArrowLeft" && pos === 0) {
        if (safeActive > 0) {
          e.preventDefault();
          setCaretPos(lines[safeActive - 1].length);
          setActive({ sheet: s, line: safeActive - 1 });
        } else if (s > 0) {
          e.preventDefault();
          const prev = sheetLines(s - 1);
          setCaretPos(prev[prev.length - 1].length);
          setActive({ sheet: s - 1, line: prev.length - 1 });
        }
        return;
      }
      if (e.key === "ArrowRight" && pos === val.length) {
        if (safeActive < lines.length - 1) {
          e.preventDefault();
          setCaretPos(0);
          setActive({ sheet: s, line: safeActive + 1 });
        } else if (s < sheets.length - 1) {
          e.preventDefault();
          setCaretPos(0);
          setActive({ sheet: s + 1, line: 0 });
        }
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const before = val.slice(0, pos);
        const after = val.slice(pos);
        const next = [...lines];
        next[safeActive] = before + "\t" + after;
        writeSheet(s, next);
        setCaretPos(pos + 1);
        setActive({ sheet: s, line: safeActive });
        return;
      }
    };

    const borderRadius = pageBorderRadius(s);

    return (
      <div
        key={`document-${s}`}
        className={`relative w-full ${pageMinHeight(s)} border bg-card p-4 ${borderRadius}`}
        onMouseDown={(e) => {
          // Clear any prior cross-line selection when starting a new click
          const sel = window.getSelection();
          if (sel && !sel.isCollapsed) sel.removeAllRanges();
          if (e.target === e.currentTarget) {
            e.preventDefault();
            focusLine(s, lines.length - 1);
          }
        }}
      >
        {lines.map((line, i) =>
          isActiveSheet && i === safeActive ? (
            <div
              key={i}
              ref={(el) => {
                inputRef.current = el;
                if (el && el.textContent !== line) el.textContent = line;
              }}
              contentEditable
              suppressContentEditableWarning
              onInput={(e) => onLineChange(e.currentTarget.textContent ?? "")}
              onKeyDown={onKeyDown}
              className="block w-full outline-none my-0 whitespace-pre-wrap break-words min-h-[1.25rem]"
              spellCheck={false}
            >
              {line}
            </div>
          ) : (
            <div
              key={i}
              onClick={() => {
                const sel = window.getSelection();
                if (sel && !sel.isCollapsed && sel.toString().length > 0) return;
                focusLine(s, i);
              }}
              className="my-0 cursor-text min-h-[1.25rem]"
              dangerouslySetInnerHTML={{ __html: renderLine(line) }}
            />
          ),
        )}
        <div
          className="absolute bottom-2 left-3 opacity-0 hover:opacity-100 transition-opacity p-2 -m-2"
          title="Delete page"
          aria-label="Delete page"
        >
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              deleteSheet(s);
            }}
            className="text-muted-foreground/70 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
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
        key={`tiles-${s}`}
        className={`relative w-full ${pageMinHeight(s)} border bg-card p-4 ${borderRadius}`}
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
        <div
          className="absolute bottom-2 left-3 opacity-0 hover:opacity-100 transition-opacity p-2 -m-2"
          title="Delete page"
          aria-label="Delete page"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              deleteSheet(s);
            }}
            className="text-muted-foreground/70 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
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
            onClick={() => {
              inputRef.current?.blur();
              setActive({ sheet: -1, line: -1 });
              setCaretPos(null);
              setView(view === "document" ? "tiles" : "document");
            }}
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
                ? "Show pages in a grid"
                : "Show pages vertically"
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

          <div
            className={`min-w-0 ${tabsVisible ? "flex-1" : "mx-auto w-full max-w-[calc(48rem-3rem)]"}`}
          >
            <main
              ref={mainRef}
              className={`w-full ${isGridLayout ? "grid grid-cols-2 gap-[4px]" : "flex flex-col gap-[4px]"}`}
            >
              {sheets.slice(0, visiblePageCount).map((_, s) =>
                view === "document" ? renderSheet(s) : renderTiles(s),
              )}
            </main>
            <button
              onClick={addSheet}
              className="mt-1.5 w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-card py-4 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Plus className="h-4 w-4" />
              New page
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}
