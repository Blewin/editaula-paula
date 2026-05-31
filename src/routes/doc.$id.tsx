import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { getItem, updateItem, useItems, type Item } from "@/lib/storage";
import { renderLine } from "@/lib/markdown";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/doc/$id")({
  component: DocEditor,
});

const SEP = "\u0001___SHEET_BREAK___\u0001";

function splitSheets(content: string): string[] {
  const parts = content.split("\n" + SEP + "\n");
  // Always have at least 2 sheets
  while (parts.length < 2) parts.push("");
  return parts;
}

function joinSheets(sheets: string[]): string {
  return sheets.join("\n" + SEP + "\n");
}

function DocEditor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  useItems(); // subscribe for reactivity
  const doc = getItem(id);

  const [name, setName] = React.useState(doc?.name ?? "");
  const [sheets, setSheets] = React.useState<string[]>(
    doc && doc.type === "doc" ? splitSheets(doc.content) : ["", ""],
  );
  const [active, setActive] = React.useState<{ sheet: number; line: number }>({
    sheet: 0,
    line: 0,
  });
  const [caretPos, setCaretPos] = React.useState<number | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (doc) {
      setName(doc.name);
      if (doc.type === "doc") setSheets(splitSheets(doc.content));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Auto-save
  React.useEffect(() => {
    if (!doc || doc.type !== "doc") return;
    const t = setTimeout(() => {
      const content = joinSheets(sheets);
      if (name !== doc.name || content !== doc.content) {
        updateItem(id, { name, content } as Partial<Item>);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [name, sheets, id, doc]);

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

    return (
      <div
        key={s}
        className={`w-full min-h-[calc(50vh-6rem)] border bg-card p-6 leading-relaxed ${
          s === 0 ? "rounded-t-lg rounded-b-none" : "rounded-t-none rounded-b-lg"
        }`}
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
              className="block w-full resize-none bg-transparent font-mono text-sm outline-none my-1 overflow-hidden"
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
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b sticky top-0 z-10 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-3xl px-6 py-3 flex items-center gap-3">
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
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-3xl px-6 py-8 flex flex-col gap-[2px]">
        {sheets.map((_, s) => renderSheet(s))}
      </main>
    </div>
  );
}
