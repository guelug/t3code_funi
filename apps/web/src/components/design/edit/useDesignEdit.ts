import type { EnvironmentId } from "@t3tools/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { confirmProjectFileQueryData } from "~/components/files/projectFilesQueryState";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";

import { injectBridge, parseBridgeMessage, type FdMode } from "./bridge";
import { formatCommentsMessage, type DesignComment } from "./comments";
import { annotateSourcePaths } from "./sourceHtml";
import { applyEditPatch } from "./sourcePatch";

/** Host side of the edit/comment bridge for one design file. */
export function useDesignEdit(input: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly file: string;
  readonly html: string | null;
}) {
  const { environmentId, cwd, file, html } = input;
  const writeFile = useAtomCommand(projectEnvironment.writeFile);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [mode, setMode] = useState<FdMode>("off");
  const [comments, setComments] = useState<readonly DesignComment[]>([]);
  const [pending, setPending] = useState<{ path: string; snippet: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const htmlRef = useRef(html);
  htmlRef.current = html;

  const srcDoc = useMemo(
    () => (html === null ? null : mode === "off" ? html : injectBridge(annotateSourcePaths(html))),
    [html, mode],
  );
  // Bridge only exists in the srcDoc while a mode is active; (re)announce on load.
  const announce = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage({ type: "fd-mode", mode }, "*");
  }, [mode]);
  useEffect(announce, [announce]);

  const changeMode = useCallback((next: FdMode) => {
    setPending(null);
    setError(null);
    setMode(next);
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      // Opaque-origin iframe: origin is "null", so identity is the window itself.
      if (event.source === null || event.source !== iframeRef.current?.contentWindow) return;
      const msg = parseBridgeMessage(event.data);
      if (!msg) return;
      if (msg.type === "fd-select") {
        setPending({ path: msg.path, snippet: msg.snippet });
        return;
      }
      const current = htmlRef.current;
      if (current === null) return;
      const result = applyEditPatch(current, msg.path, msg.patch);
      if (!result.ok) {
        setError(`Edit not saved: ${result.reason}`);
        return;
      }
      setError(null);
      htmlRef.current = result.html;
      confirmProjectFileQueryData(environmentId, cwd, file, result.html);
      void Promise.resolve(
        writeFile({ environmentId, input: { cwd, relativePath: file, contents: result.html } }),
      ).catch(() => setError("Edit could not be written to the workspace."));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [cwd, environmentId, file, writeFile]);

  const addComment = useCallback(
    (note: string) => {
      if (!pending || note.trim().length === 0) return;
      setComments((prev) => [
        ...prev,
        {
          id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
          ...pending,
          note,
        },
      ]);
      setPending(null);
    },
    [pending],
  );
  const clearComments = useCallback(() => setComments([]), []);
  const commentsMessage = useCallback(
    () => formatCommentsMessage(file, comments),
    [comments, file],
  );

  return {
    iframeRef,
    announce,
    srcDoc,
    mode,
    changeMode,
    error,
    comments,
    pending,
    addComment,
    cancelPending: () => setPending(null),
    clearComments,
    commentsMessage,
  };
}
