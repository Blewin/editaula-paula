// Minimal markdown -> HTML renderer. Good enough for preview.
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function inline(s: string) {
  let out = escapeHtml(s);
  // code
  out = out.replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-sm">$1</code>');
  // bold
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // italic
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  // links
  out = out.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a class="text-primary underline" href="$2" target="_blank" rel="noopener">$1</a>',
  );
  return out;
}

// Render a single line of markdown to HTML (no multi-line constructs like code fences).
// Empty lines render as a non-breaking space so the line keeps its height.
export function renderLine(raw: string): string {
  const line = raw.trimEnd();
  if (!line.trim()) return '<span class="opacity-0">.</span>';
  const h = /^(#{1,6})\s+(.*)$/.exec(line);
  if (h) {
    const level = h[1].length;
    const sizes = ["text-3xl", "text-2xl", "text-xl", "text-lg", "text-base", "text-sm"];
    return `<span class="${sizes[level - 1]} font-bold">${inline(h[2])}</span>`;
  }
  const ul = /^[-*]\s+(.*)$/.exec(line);
  if (ul) return `<span class="inline-block w-4">•</span>${inline(ul[1])}`;
  const ol = /^(\d+)\.\s+(.*)$/.exec(line);
  if (ol) return `<span class="inline-block w-6">${ol[1]}.</span>${inline(ol[2])}`;
  if (line.startsWith("> "))
    return `<span class="border-l-4 border-muted pl-3 italic text-muted-foreground inline-block">${inline(line.slice(2))}</span>`;
  if (line.startsWith("```"))
    return `<span class="font-mono text-sm text-muted-foreground">${escapeHtml(line)}</span>`;
  return inline(line);
}

export function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let inCode = false;
  let codeBuf: string[] = [];
  let listType: "ul" | "ol" | null = null;
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    if (raw.startsWith("```")) {
      if (inCode) {
        html.push(
          `<pre class="rounded-md bg-muted p-3 text-sm overflow-x-auto"><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`,
        );
        codeBuf = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuf.push(raw);
      continue;
    }
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      closeList();
      const level = h[1].length;
      const sizes = ["text-3xl", "text-2xl", "text-xl", "text-lg", "text-base", "text-sm"];
      html.push(
        `<h${level} class="${sizes[level - 1]} font-bold mt-4 mb-2">${inline(h[2])}</h${level}>`,
      );
      continue;
    }
    const ul = /^[-*]\s+(.*)$/.exec(line);
    if (ul) {
      if (listType !== "ul") {
        closeList();
        html.push('<ul class="list-disc pl-6 my-2 space-y-1">');
        listType = "ul";
      }
      html.push(`<li>${inline(ul[1])}</li>`);
      continue;
    }
    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ol) {
      if (listType !== "ol") {
        closeList();
        html.push('<ol class="list-decimal pl-6 my-2 space-y-1">');
        listType = "ol";
      }
      html.push(`<li>${inline(ol[1])}</li>`);
      continue;
    }
    if (line.startsWith("> ")) {
      closeList();
      html.push(
        `<blockquote class="border-l-4 border-muted pl-3 italic text-muted-foreground my-2">${inline(line.slice(2))}</blockquote>`,
      );
      continue;
    }
    closeList();
    html.push(`<p class="my-2 leading-relaxed">${inline(line)}</p>`);
  }
  closeList();
  if (inCode) {
    html.push(
      `<pre class="rounded-md bg-muted p-3 text-sm overflow-x-auto"><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`,
    );
  }
  return html.join("\n");
}
