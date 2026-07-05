import {
  EditorView,
  Decoration,
  ViewPlugin,
  WidgetType,
  keymap,
  drawSelection,
  dropCursor,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { EditorState, Prec, type Extension } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";

class BulletWidget extends WidgetType {
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-md-bullet";
    s.textContent = "•";
    return s;
  }
  eq(_: BulletWidget) {
    return true;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }
  eq(o: CheckboxWidget) {
    return o.checked === this.checked && o.from === this.from && o.to === this.to;
  }
  toDOM(view: EditorView) {
    const i = document.createElement("input");
    i.type = "checkbox";
    i.checked = this.checked;
    i.className = "cm-md-checkbox";
    i.addEventListener("mousedown", (e) => e.preventDefault());
    i.addEventListener("click", (e) => {
      e.preventDefault();
      // Toggle the char between [ and ]
      const text = view.state.doc.sliceString(this.from, this.to);
      const openIdx = text.indexOf("[");
      if (openIdx < 0) return;
      const charFrom = this.from + openIdx + 1;
      const insert = this.checked ? " " : "x";
      view.dispatch({ changes: { from: charFrom, to: charFrom + 1, insert } });
    });
    return i;
  }
  ignoreEvent() {
    return false;
  }
}

class HRWidget extends WidgetType {
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-md-hr";
    return s;
  }
  eq(_: HRWidget) {
    return true;
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const doc = view.state.doc;
  const sel = view.state.selection;
  const activeLines = new Set<number>();
  for (const r of sel.ranges) {
    const a = doc.lineAt(r.from).number;
    const b = doc.lineAt(r.to).number;
    for (let n = a; n <= b; n++) activeLines.add(n);
  }
  const isActive = (pos: number) => activeLines.has(doc.lineAt(pos).number);

  type Entry = { from: number; to: number; deco: Decoration };
  const entries: Entry[] = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const name = node.name;

        if (/^ATXHeading[1-6]$/.test(name)) {
          const level = parseInt(name.slice("ATXHeading".length), 10);
          const line = doc.lineAt(node.from);
          entries.push({
            from: line.from,
            to: line.from,
            deco: Decoration.line({ attributes: { class: `cm-md-h${level}` } }),
          });
          if (!isActive(node.from)) {
            let hideTo = node.from + level;
            if (doc.sliceString(hideTo, hideTo + 1) === " ") hideTo++;
            entries.push({
              from: node.from,
              to: hideTo,
              deco: Decoration.replace({}),
            });
          }
        } else if (name === "ListMark") {
          const markText = doc.sliceString(node.from, node.to);
          if ((markText === "-" || markText === "*" || markText === "+") && !isActive(node.from)) {
            // Check this ListMark isn't part of a task item (task marker follows)
            const rest = doc.sliceString(node.to, Math.min(node.to + 5, doc.length));
            if (!/^\s\[[ xX]\]/.test(rest)) {
              entries.push({
                from: node.from,
                to: node.to,
                deco: Decoration.replace({ widget: new BulletWidget() }),
              });
            }
          }
        } else if (name === "TaskMarker") {
          const text = doc.sliceString(node.from, node.to);
          const checked = /\[[xX]\]/.test(text);
          if (!isActive(node.from)) {
            entries.push({
              from: node.from,
              to: node.to,
              deco: Decoration.replace({
                widget: new CheckboxWidget(checked, node.from, node.to),
              }),
            });
          }
          if (checked) {
            const line = doc.lineAt(node.from);
            entries.push({
              from: line.from,
              to: line.from,
              deco: Decoration.line({ attributes: { class: "cm-md-task-done" } }),
            });
          }
        } else if (name === "EmphasisMark" || name === "StrongEmphasisMark") {
          if (!isActive(node.from)) {
            entries.push({ from: node.from, to: node.to, deco: Decoration.replace({}) });
          }
        } else if (name === "CodeMark") {
          if (!isActive(node.from)) {
            entries.push({ from: node.from, to: node.to, deco: Decoration.replace({}) });
          }
        } else if (name === "Emphasis") {
          entries.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-md-em" }) });
        } else if (name === "StrongEmphasis") {
          entries.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-md-strong" }) });
        } else if (name === "InlineCode") {
          entries.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-md-inline-code" }) });
        } else if (name === "Link") {
          entries.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: "cm-md-link" }) });
        } else if (name === "URL") {
          // hide the URL portion of an inline link when not active
          if (!isActive(node.from)) {
            // find surrounding parens
            const before = doc.sliceString(Math.max(0, node.from - 1), node.from);
            const after = doc.sliceString(node.to, node.to + 1);
            if (before === "(" && after === ")") {
              entries.push({ from: node.from - 1, to: node.to + 1, deco: Decoration.replace({}) });
            }
          }
        } else if (name === "LinkMark") {
          // hide the [ ] brackets of inline links
          if (!isActive(node.from)) {
            const ch = doc.sliceString(node.from, node.to);
            if (ch === "[" || ch === "]") {
              entries.push({ from: node.from, to: node.to, deco: Decoration.replace({}) });
            }
          }
        } else if (name === "Blockquote") {
          const a = doc.lineAt(node.from).number;
          const b = doc.lineAt(node.to).number;
          for (let ln = a; ln <= b; ln++) {
            const li = doc.line(ln);
            entries.push({
              from: li.from,
              to: li.from,
              deco: Decoration.line({ attributes: { class: "cm-md-blockquote" } }),
            });
          }
        } else if (name === "QuoteMark") {
          if (!isActive(node.from)) {
            let to = node.to;
            if (doc.sliceString(to, to + 1) === " ") to++;
            entries.push({ from: node.from, to, deco: Decoration.replace({}) });
          }
        } else if (name === "HorizontalRule") {
          if (!isActive(node.from)) {
            entries.push({
              from: node.from,
              to: node.to,
              deco: Decoration.replace({ widget: new HRWidget() }),
            });
          }
        } else if (name === "FencedCode") {
          const a = doc.lineAt(node.from).number;
          const b = doc.lineAt(node.to).number;
          for (let ln = a; ln <= b; ln++) {
            const li = doc.line(ln);
            entries.push({
              from: li.from,
              to: li.from,
              deco: Decoration.line({ attributes: { class: "cm-md-codeblock" } }),
            });
          }
        }
      },
    });
  }

  return Decoration.set(
    entries.map((e) => e.deco.range(e.from, e.to)),
    true,
  );
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    eventHandlers: {
      mousedown(e, view) {
        const t = e.target as HTMLElement | null;
        if (!t) return false;
        // Ctrl/Cmd+click on rendered link → open URL
        if ((e.metaKey || e.ctrlKey) && t.closest(".cm-md-link")) {
          const pos = view.posAtDOM(t);
          if (pos == null) return false;
          const tree = syntaxTree(view.state);
          const node = tree.resolveInner(pos, 1);
          // find enclosing Link
          let cur: typeof node | null = node;
          while (cur && cur.name !== "Link") cur = cur.parent;
          if (cur) {
            const text = view.state.doc.sliceString(cur.from, cur.to);
            const m = text.match(/\((https?:\/\/[^\s)]+)\)/);
            if (m) {
              window.open(m[1], "_blank", "noopener");
              e.preventDefault();
              return true;
            }
          }
        }
        return false;
      },
    },
  },
);

const editorTheme = EditorView.theme({
  "&": {
    fontFamily: 'Inter, -apple-system, "Segoe UI", sans-serif',
    fontSize: "16px",
    color: "var(--text-normal, hsl(var(--foreground)))",
    backgroundColor: "transparent",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: 'Inter, -apple-system, "Segoe UI", sans-serif',
    lineHeight: "1.6",
  },
  ".cm-content": {
    padding: "0",
    caretColor: "var(--text-normal, hsl(var(--foreground)))",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--text-normal, hsl(var(--foreground)))",
    borderLeftWidth: "2px",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    background: "rgba(100, 149, 237, 0.30)",
  },
  ".cm-line": { padding: "0 2px" },
  ".cm-md-h1": { fontSize: "1.7em", fontWeight: "700", lineHeight: "1.3", paddingTop: "0.35em" },
  ".cm-md-h2": { fontSize: "1.45em", fontWeight: "700", lineHeight: "1.3", paddingTop: "0.3em" },
  ".cm-md-h3": { fontSize: "1.25em", fontWeight: "700", lineHeight: "1.3", paddingTop: "0.25em" },
  ".cm-md-h4": { fontSize: "1.1em", fontWeight: "700", lineHeight: "1.3", paddingTop: "0.2em" },
  ".cm-md-h5": { fontSize: "1em", fontWeight: "700", lineHeight: "1.3" },
  ".cm-md-h6": { fontSize: "0.95em", fontWeight: "700", lineHeight: "1.3", opacity: "0.85" },
  ".cm-md-strong": { fontWeight: "700" },
  ".cm-md-em": { fontStyle: "italic" },
  ".cm-md-inline-code": {
    fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
    fontSize: "0.92em",
    backgroundColor: "color-mix(in oklab, currentColor 8%, transparent)",
    padding: "0.05em 0.35em",
    borderRadius: "4px",
  },
  ".cm-md-link": {
    color: "var(--text-accent, hsl(var(--primary)))",
    textDecoration: "underline",
    textUnderlineOffset: "2px",
    cursor: "text",
  },
  ".cm-md-bullet": {
    color: "color-mix(in oklab, currentColor 55%, transparent)",
    display: "inline-block",
    width: "1em",
  },
  ".cm-md-checkbox": {
    marginRight: "0.4em",
    verticalAlign: "-1px",
    cursor: "pointer",
  },
  ".cm-md-task-done": {
    textDecoration: "line-through",
    opacity: "0.6",
  },
  ".cm-md-blockquote": {
    borderLeft: "3px solid var(--text-accent, hsl(var(--primary)))",
    paddingLeft: "0.75em",
    color: "color-mix(in oklab, currentColor 75%, transparent)",
  },
  ".cm-md-codeblock": {
    fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
    fontSize: "0.92em",
    backgroundColor: "color-mix(in oklab, currentColor 6%, transparent)",
  },
  ".cm-md-hr": {
    display: "inline-block",
    width: "100%",
    borderTop: "1px solid color-mix(in oklab, currentColor 25%, transparent)",
    height: "1px",
    verticalAlign: "middle",
    margin: "0.5em 0",
  },
});

export type MarkdownEditorOptions = {
  value: string;
  onChange: (next: string) => void;
  onSelectAll?: () => boolean; // return true if custom handled
  onFocus?: () => void;
};

export function createMarkdownEditor(parent: HTMLElement, opts: MarkdownEditorOptions): EditorView {
  const updateListener = EditorView.updateListener.of((u) => {
    if (u.docChanged) opts.onChange(u.state.doc.toString());
    if (u.focusChanged && u.view.hasFocus) opts.onFocus?.();
  });

  const selectAllOverride = Prec.highest(
    keymap.of([
      {
        key: "Mod-a",
        run: () => {
          if (opts.onSelectAll) return opts.onSelectAll();
          return false;
        },
      },
    ]),
  );

  const state = EditorState.create({
    doc: opts.value,
    extensions: [
      history(),
      drawSelection(),
      markdown({ base: markdownLanguage, addKeymap: true }),
      livePreviewPlugin,
      editorTheme,
      EditorView.lineWrapping,
      selectAllOverride,
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      updateListener,
    ],
  });

  return new EditorView({ state, parent });
}
