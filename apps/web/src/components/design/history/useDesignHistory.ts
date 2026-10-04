import type { EnvironmentId } from "@t3tools/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  confirmProjectFileQueryData,
  useProjectEntriesQuery,
  useProjectFileQuery,
} from "~/components/files/projectFilesQueryState";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";

import { HISTORY_DIR, historyPath, parseHistory, shouldSnapshot } from "./history.logic";

const MIN_SNAPSHOT_GAP_MS = 5_000;

/**
 * Snapshots the previous HTML into design/.history/ whenever the file content
 * changes (Edit-save, Apply, restore or agent rewrite), throttled so a burst of
 * edits keeps its pre-burst state. Listing is capped at 30 (newest first).
 */
export function useDesignHistory(input: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly file: string;
  readonly html: string | null;
  readonly workspaceMutationId: string | null;
}) {
  const { environmentId, cwd, file, html, workspaceMutationId } = input;
  const writeFile = useAtomCommand(projectEnvironment.writeFile);
  const entries = useProjectEntriesQuery(environmentId, cwd, HISTORY_DIR);
  const refreshEntries = entries.refresh;
  const prevRef = useRef<{ file: string; html: string | null }>({ file, html });
  const lastSnap = useRef<{ html: string | null; at: number }>({ html: null, at: 0 });
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { file, html };
    if (prev.file !== file || prev.html === html || html === null) return;
    const now = Date.now();
    if (!shouldSnapshot(prev.html, lastSnap.current.html)) return;
    if (now - lastSnap.current.at < MIN_SNAPSHOT_GAP_MS) return;
    lastSnap.current = { html: prev.html, at: now };
    void Promise.resolve(
      writeFile({
        environmentId,
        input: { cwd, relativePath: historyPath(new Date(now)), contents: prev.html },
      }),
    )
      .then(() => refreshEntries())
      .catch(() => setError("History snapshot could not be written."));
  }, [cwd, environmentId, file, html, refreshEntries, writeFile]);

  useEffect(() => {
    if (workspaceMutationId !== null) refreshEntries();
  }, [workspaceMutationId, refreshEntries]);

  const snapshots = useMemo(() => parseHistory(entries.data?.entries ?? []), [entries.data]);

  // Restore = read the chosen snapshot, then write it over the design file.
  const restoreQuery = useProjectFileQuery(environmentId, cwd, restorePath, restorePath !== null);
  const restored = restoreQuery.data?.contents;
  useEffect(() => {
    if (restorePath === null || typeof restored !== "string") return;
    setRestorePath(null);
    confirmProjectFileQueryData(environmentId, cwd, file, restored);
    void Promise.resolve(
      writeFile({ environmentId, input: { cwd, relativePath: file, contents: restored } }),
    ).catch(() => setError("Restore could not be written."));
  }, [restorePath, restored, cwd, environmentId, file, writeFile]);

  const restore = useCallback((path: string) => setRestorePath(path), []);
  /** Undo = restore the newest snapshot. */
  const undo = useCallback(() => {
    const newest = snapshots[0];
    if (newest) setRestorePath(newest.path);
  }, [snapshots]);

  return { snapshots, restore, undo, error };
}
