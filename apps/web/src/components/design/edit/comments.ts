export interface DesignComment {
  readonly id: string;
  readonly path: string;
  readonly snippet: string;
  readonly note: string;
}

const SNIPPET_MAX = 160;

export function clipSnippet(snippet: string): string {
  const flat = snippet.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_MAX ? `${flat.slice(0, SNIPPET_MAX)}…` : flat;
}

/** Structured composer message: one block per comment, anchored by source path. */
export function formatCommentsMessage(file: string, comments: readonly DesignComment[]): string {
  const lines = [
    `Design review comments for \`${file}\`. Elements are identified by their document-order index (\`data-fd-source-path\`, counting every start tag in the source) plus an HTML snippet. Apply each change:`,
    "",
  ];
  comments.forEach((comment, index) => {
    lines.push(
      `${index + 1}. element #${comment.path}`,
      `   snippet: \`${clipSnippet(comment.snippet).replace(/`/g, "'")}\``,
      `   note: ${comment.note.trim()}`,
    );
  });
  return lines.join("\n");
}
