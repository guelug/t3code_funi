export const HISTORY_DIR = "design/.history";
export const HISTORY_CAP = 30;

/** Sortable, filesystem-safe timestamp name: 20261004T101500123. */
export function historyPath(now = new Date()): string {
  const stamp = now.toISOString().replace(/[-:.Z]/g, "");
  return `${HISTORY_DIR}/${stamp}.html`;
}

export interface HistoryEntry {
  readonly path: string;
  readonly label: string;
}

function labelOf(path: string): string {
  const m = /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(path);
  return m ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}` : path;
}

/** Newest-first snapshot list, capped. */
export function parseHistory(
  entries: readonly { readonly path: string; readonly kind: string }[],
  cap = HISTORY_CAP,
): HistoryEntry[] {
  return entries
    .filter((e) => e.kind === "file" && /(^|\/)design\/\.history\/\d{8}T\d+\.html$/.test(e.path))
    .map((e) => e.path)
    .toSorted()
    .toReversed()
    .slice(0, cap)
    .map((path) => ({ path, label: labelOf(path) }));
}

/** Paths beyond the cap (oldest), for pruning where a delete primitive exists. */
export function overflowPaths(paths: readonly string[], cap = HISTORY_CAP): string[] {
  return paths.toSorted().toReversed().slice(cap);
}

/** Snapshot only when there is content and it differs from the latest snapshot. */
export function shouldSnapshot(
  html: string | null,
  lastSnapshotted: string | null,
): html is string {
  return html !== null && html.length > 0 && html !== lastSnapshotted;
}
