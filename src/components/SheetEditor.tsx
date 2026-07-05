import * as React from "react";
import { createMarkdownEditor } from "@/lib/markdown-editor";
import type { EditorView } from "@codemirror/view";

export type SheetEditorProps = {
  value: string;
  onChange: (next: string) => void;
  onFocus?: () => void;
  onSelectAll?: () => boolean;
  className?: string;
};

export const SheetEditor = React.forwardRef<HTMLDivElement, SheetEditorProps>(
  function SheetEditor({ value, onChange, onFocus, onSelectAll, className }, ref) {
    const hostRef = React.useRef<HTMLDivElement | null>(null);
    const viewRef = React.useRef<EditorView | null>(null);
    const onChangeRef = React.useRef(onChange);
    const onFocusRef = React.useRef(onFocus);
    const onSelectAllRef = React.useRef(onSelectAll);
    onChangeRef.current = onChange;
    onFocusRef.current = onFocus;
    onSelectAllRef.current = onSelectAll;

    React.useEffect(() => {
      const host = hostRef.current;
      if (!host) return;
      const view = createMarkdownEditor(host, {
        value,
        onChange: (v) => onChangeRef.current(v),
        onFocus: () => onFocusRef.current?.(),
        onSelectAll: () => onSelectAllRef.current?.() ?? false,
      });
      viewRef.current = view;
      return () => {
        view.destroy();
        viewRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Sync external value changes without disturbing selection/undo when equal
    React.useEffect(() => {
      const view = viewRef.current;
      if (!view) return;
      const current = view.state.doc.toString();
      if (current !== value) {
        view.dispatch({
          changes: { from: 0, to: current.length, insert: value },
        });
      }
    }, [value]);

    return (
      <div
        ref={(el) => {
          hostRef.current = el;
          if (typeof ref === "function") ref(el);
          else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }}
        className={className}
      />
    );
  },
);
