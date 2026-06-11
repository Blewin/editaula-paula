import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlignJustify, ArrowLeft, CornerDownLeft, FileText, Plus } from "lucide-react";
import { getItem, updateItem, useItems, type Item } from "@/lib/storage";
import { renderLine } from "@/lib/markdown";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/doc/$id")({
  component: DocEditor,
});

const SEP = "\u0001___SHEET_BREAK___\u0001";
const TABS_MARKER = "\u0001___TABS_V1___\u0001\n";

type Tab = { name: string; content: string };

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
  while (parts.length < 4) parts.push("");
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
  const [sheetsPerTab, setSheetsPerTab] = React.useState<2 | 4>(2);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
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

  // Focus active line input and place caret
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
    if (caretPos !== null) {
      const pos = Math.min(caretPos, el.value.length);
      el.setSelectionRange(pos, pos);
      setCaretPos(null);
    }
  }, [active, caretPos]);

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

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      const pos = el.selectionStart ?? 0;
      const val = el.value;

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
          // jump to last line of previous sheet
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

    const borderRadius =
      sheetsPerTab === 4
        ? "rounded-lg"
        : s === 0
          ? "rounded-t-lg rounded-b-none"
          : "rounded-t-none rounded-b-lg";

    return (
      <div
        key={s}
        className={`relative w-full min-h-[calc(50vh-6rem)] border bg-card p-6 leading-relaxed ${borderRadius}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) focusLine(s, lines.length - 1);
        }}
      >
        {lines.map((line, i) =>
          isActiveSheet && i === safeActive ? (
            <textarea
              key={i}
              ref={inputRef}
              value={line}
              onChange={(e) => onLineChange(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              className="block w-full resize-none bg-transparent outline-none my-1 overflow-hidden"
              spellCheck={false}
            />
          ) : (
            <div
              key={i}
              onClick={() => focusLine(s, i)}
              className="my-1 cursor-text min-h-[1.5rem]"
              dangerouslySetInnerHTML={{ __html: renderLine(line) }}
            />
          ),
        )}
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

  const reorderSheetParagraphs = (s: number, from: number, to: number) => {
    const ps = splitParagraphs(sheets[s] ?? "");
    if (from === to || from < 0 || from >= ps.length) return;
    const [moved] = ps.splice(from, 1);
    ps.splice(Math.max(0, Math.min(to, ps.length)), 0, moved);
    const next = [...sheets];
    next[s] = joinParagraphs(ps);
    setSheets(next);
  };

  const renderTiles = (s: number) => {
    const paragraphs = splitParagraphs(sheets[s] ?? "");
    const borderRadius =
      sheetsPerTab === 4
        ? "rounded-lg"
        : s === 0
          ? "rounded-t-lg rounded-b-none"
          : "rounded-t-none rounded-b-lg";
    return (
      <div
        key={s}
        className={`relative w-full min-h-[calc(50vh-6rem)] border bg-card p-4 ${borderRadius}`}
      >
        {paragraphs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No paragraphs yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {paragraphs.map((p, i) => (
              <div
                key={i}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", String(i));
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = Number(e.dataTransfer.getData("text/plain"));
                  if (!Number.isNaN(from)) reorderSheetParagraphs(s, from, i);
                }}
                className="cursor-move w-full rounded-md border bg-background px-4 py-3 text-sm leading-snug shadow-sm hover:shadow-md transition-shadow whitespace-pre-wrap break-words"
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
            onClick={() =>
              navigate({
                to: "/",
                search: doc.parentId ? { folder: doc.parentId } : {},
              })
            }
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
        </div>
      </header>

      <div className="flex-1 mx-auto w-full px-6 py-8 relative max-w-4xl">
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
            <aside className="w-44 shrink-0 pt-10">
              <Button
                variant="outline"
                className="w-full justify-start gap-2 mb-2 text-sm"
                onClick={addTab}
              >
                <Plus className="h-4 w-4" />
                New tab
              </Button>
              <nav className="flex flex-col gap-1">
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
            className={`min-w-0 flex flex-col gap-[4px] ${
              tabsVisible ? "flex-1" : "mx-auto w-full max-w-[calc(48rem-3rem)]"
            }`}
          >
            {sheets.map((_, s) => (view === "document" ? renderSheet(s) : renderTiles(s)))}
          </main>
        </div>
      </div>

    </div>
  );
}
