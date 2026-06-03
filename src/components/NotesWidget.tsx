import React, { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StickyNote, Pencil, Eye, X } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "app.notes.v1";

function linkify(text: string): (string | React.ReactElement)[] {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+)/g;
  const parts: (string | React.ReactElement)[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    let href = match[0];
    if (href.startsWith("www.")) {
      href = "https://" + href;
    }

    parts.push(
      <a
        key={match.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2"
        onClick={(e) => e.stopPropagation()}
      >
        {match[0]}
      </a>,
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export function NotesWidget() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        setNotes(saved);
      }
    } catch {
      // SSR safety / private mode
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, notes);
    } catch {
      // SSR safety / private mode
    }
  }, [notes]);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "edit" ? "preview" : "edit"));
  }, []);

  const handlePreviewDoubleClick = useCallback(() => {
    setMode("edit");
  }, []);

  return (
    <>
      <Button
        variant="default"
        size="icon"
        className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full shadow-lg"
        onClick={toggleOpen}
        aria-label={open ? "Close notes" : "Open notes"}
      >
        <StickyNote size={20} />
      </Button>

      {open && (
        <div className="fixed bottom-20 right-4 z-50 flex w-80 flex-col rounded-lg border bg-popover text-popover-foreground shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-semibold">Notes</span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={toggleMode}
                aria-label={mode === "edit" ? "Switch to preview" : "Switch to edit"}
              >
                {mode === "edit" ? <Eye size={16} /> : <Pencil size={16} />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={closePanel}
                aria-label="Close notes"
              >
                <X size={16} />
              </Button>
            </div>
          </div>

          {mode === "edit" ? (
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Things to improve… paste links and they'll become clickable in preview."
              className={cn(
                "min-h-[240px] resize-none rounded-none border-0 bg-transparent px-4 py-3 text-sm shadow-none",
                "focus-visible:ring-0 focus-visible:outline-none",
                "placeholder:text-muted-foreground",
              )}
            />
          ) : (
            <div
              className="min-h-[240px] whitespace-pre-wrap px-4 py-3 text-sm"
              onDoubleClick={handlePreviewDoubleClick}
            >
              {notes ? (
                linkify(notes)
              ) : (
                <span className="text-muted-foreground">
                  Things to improve… paste links and they'll become clickable in preview.
                </span>
              )}
            </div>
          )}

          <div className="px-4 py-2 border-t">
            <p className="text-xs text-muted-foreground">
              Auto-saved locally · double-click to edit
            </p>
          </div>
        </div>
      )}
    </>
  );
}
