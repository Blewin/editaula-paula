import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { getItem, updateItem, useItems, type Item } from "@/lib/storage";
import { renderLine } from "@/lib/markdown";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/doc/$id")({
  component: DocEditor,
});

const DIVIDER = "\u0001___SHEET_DIVIDER___\u0001";

function ensureDivider(c: string): string {
  if (c.includes(DIVIDER)) return c;
  return (c ? c + "\n" : "") + DIVIDER + "\n";
}

function DocEditor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  useItems(); // subscribe for reactivity
  const doc = getItem(id);

  const [name, setName] = React.useState(doc?.name ?? "");
  const [content, setContent] = React.useState(
    doc && doc.type === "doc" ? ensureDivider(doc.content) : "",
  );
  const [active, setActive] = React.useState<number>(0);
  const [caretPos, setCaretPos] = React.useState<number | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (doc) {
      setName(doc.name);
      if (doc.type === "doc") setContent(ensureDivider(doc.content));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Auto-save
  React.useEffect(() => {
    if (!doc || doc.type !== "doc") return;
    const t = setTimeout(() => {
      if (name !== doc.name || content !== doc.content) {
        updateItem(id, { name, content } as Partial<Item>);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [name, content, id, doc]);

  // Focus active line input and place caret
  React.useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // Auto-size
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

  const lines = content.length === 0 ? [""] : content.split("\n");
  let safeActive = Math.min(active, lines.length - 1);
  if (lines[safeActive] === DIVIDER) {
    // never let the divider be the active editable line
    safeActive = safeActive + 1 < lines.length ? safeActive + 1 : safeActive - 1;
  }

  const setLines = (next: string[], newActive: number, newCaret: number | null = null) => {
    setContent(next.join("\n"));
    setActive(newActive);
    if (newCaret !== null) setCaretPos(newCaret);
  };

  const onLineChange = (val: string) => {
    // If user pasted/typed a newline, split into multiple lines
    if (val.includes("\n")) {
      const parts = val.split("\n");
      const next = [...lines];
      next.splice(safeActive, 1, ...parts);
      setLines(next, safeActive + parts.length - 1, parts[parts.length - 1].length);
      return;
    }
    const next = [...lines];
    next[safeActive] = val;
    setContent(next.join("\n"));
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
      setLines(next, safeActive + 1, 0);
      return;
    }
    if (e.key === "Backspace" && pos === 0 && safeActive > 0) {
      const prev = lines[safeActive - 1];
      if (prev === DIVIDER) {
        // do not merge across the sheet divider
        e.preventDefault();
        if (safeActive - 2 >= 0) {
          setCaretPos(lines[safeActive - 2].length);
          setActive(safeActive - 2);
        }
        return;
      }
      e.preventDefault();
      const next = [...lines];
      next.splice(safeActive - 1, 2, prev + val);
      setLines(next, safeActive - 1, prev.length);
      return;
    }
    if (e.key === "ArrowUp" && safeActive > 0) {
      e.preventDefault();
      let target = safeActive - 1;
      if (lines[target] === DIVIDER) target -= 1;
      if (target >= 0) {
        setCaretPos(Math.min(pos, lines[target].length));
        setActive(target);
      }
      return;
    }
    if (e.key === "ArrowDown" && safeActive < lines.length - 1) {
      e.preventDefault();
      let target = safeActive + 1;
      if (lines[target] === DIVIDER) target += 1;
      if (target < lines.length) {
        setCaretPos(Math.min(pos, lines[target].length));
        setActive(target);
      }
      return;
    }
  };

  const focusLine = (idx: number, caret: number | null = null) => {
    if (lines[idx] === DIVIDER) {
      // bounce to the line just below the divider; create one if missing
      if (idx + 1 < lines.length) {
        setActive(idx + 1);
        setCaretPos(caret ?? lines[idx + 1].length);
      } else {
        const next = [...lines, ""];
        setLines(next, next.length - 1, 0);
      }
      return;
    }
    setActive(idx);
    setCaretPos(caret ?? lines[idx].length);
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

      <main className="flex-1 mx-auto w-full max-w-3xl px-6 py-8">
        <div
          className="relative w-full min-h-[calc(100vh-10rem)] rounded-lg border bg-card p-6 leading-relaxed"
          onClick={(e) => {
            // Clicking empty area at the bottom focuses the last writable line
            if (e.target === e.currentTarget) {
              const lastIdx = lines.length - 1;
              if (lines[lastIdx] === DIVIDER) {
                const next = [...lines, ""];
                setLines(next, next.length - 1, 0);
              } else {
                focusLine(lastIdx);
              }
            }
          }}
        >
          {lines.map((line, i) => {
            if (line === DIVIDER) {
              return (
                <div
                  key={i}
                  onClick={() => focusLine(i)}
                  aria-hidden
                  className="my-4 flex items-center gap-3 cursor-text select-none"
                >
                  <span className="h-[3px] flex-1 rounded-full bg-foreground/50" />
                </div>
              );
            }
            return i === safeActive ? (
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
                onClick={() => focusLine(i)}
                className="my-1 cursor-text min-h-[1.5rem]"
                dangerouslySetInnerHTML={{ __html: renderLine(line) }}
              />
            );
          })}
        </div>
      </main>
    </div>
  );
}

