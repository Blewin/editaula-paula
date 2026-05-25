import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Eye, Pencil, Columns } from "lucide-react";
import { getItem, updateItem, useItems, type Item } from "@/lib/storage";
import { renderMarkdown } from "@/lib/markdown";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/doc/$id")({
  component: DocEditor,
});

type Mode = "edit" | "preview" | "split";

function DocEditor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  useItems(); // subscribe for reactivity
  const doc = getItem(id);

  const [mode, setMode] = React.useState<Mode>("split");
  const [name, setName] = React.useState(doc?.name ?? "");
  const [content, setContent] = React.useState(doc && doc.type === "doc" ? doc.content : "");

  React.useEffect(() => {
    if (doc) {
      setName(doc.name);
      if (doc.type === "doc") setContent(doc.content);
    }
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
  }, [name, content, id]);

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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b sticky top-0 z-10 bg-background/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-3 flex items-center gap-3">
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
          <div className="flex rounded-md border p-0.5">
            <ModeBtn active={mode === "edit"} onClick={() => setMode("edit")}>
              <Pencil className="size-4" />
            </ModeBtn>
            <ModeBtn active={mode === "split"} onClick={() => setMode("split")}>
              <Columns className="size-4" />
            </ModeBtn>
            <ModeBtn active={mode === "preview"} onClick={() => setMode("preview")}>
              <Eye className="size-4" />
            </ModeBtn>
          </div>
        </div>
      </header>

      <div className="flex-1 mx-auto w-full max-w-6xl px-6 py-6">
        <div
          className={
            mode === "split"
              ? "grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100vh-9rem)]"
              : "h-[calc(100vh-9rem)]"
          }
        >
          {(mode === "edit" || mode === "split") && (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="w-full h-full resize-none rounded-lg border bg-card p-4 font-mono text-sm outline-none focus:ring-1 focus:ring-ring"
              placeholder="# Write some markdown..."
              spellCheck={false}
            />
          )}
          {(mode === "preview" || mode === "split") && (
            <div
              className="w-full h-full overflow-auto rounded-lg border bg-card p-6 prose-sm"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ModeBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "px-2.5 py-1 rounded text-sm transition-colors " +
        (active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50")
      }
    >
      {children}
    </button>
  );
}
