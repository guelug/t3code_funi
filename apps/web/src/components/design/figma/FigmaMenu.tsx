/** SPDX-License-Identifier: Apache-2.0 (capture/import logic derived from Open Design). */
import { useEffect, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogPanel,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";

import {
  captureFileName,
  injectCaptureScript,
  listenForCapture,
  type FigmaCapture,
} from "./figmaCapture";
import { extractFileKey, fetchFigmaFile, liftTokens, tokensToDesignMd } from "./figmaImport";

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * "Figma" dropdown for the Design panel. Export renders the HTML in a hidden, sandboxed
 * (opaque-origin) iframe with the capture script injected. Import keeps the token in
 * component state only — never logged, never persisted.
 */
export function FigmaMenu(props: {
  readonly html: string | null;
  readonly file: string;
  /** Receives the generated DESIGN.md (host stores it as a custom design system). */
  readonly onUseAsDesignSystem?: (name: string, markdown: string) => void;
}) {
  const [exportDoc, setExportDoc] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [token, setToken] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ name: string; markdown: string } | null>(null);

  useEffect(() => {
    if (exportDoc === null) return;
    const frame = frameRef.current;
    if (!frame) return;
    const timer = window.setTimeout(() => {
      setStatus("Capture timed out.");
      setExportDoc(null);
    }, 8000);
    const stop = listenForCapture(frame, (r) => {
      window.clearTimeout(timer);
      if ("capture" in r) {
        const capture: FigmaCapture = r.capture;
        download(captureFileName(props.file), JSON.stringify(capture), "application/json");
        setStatus(
          `Downloaded ${captureFileName(props.file)} — open it with the FUNIBER Figma Import plugin.`,
        );
      } else setStatus(r.error);
      setExportDoc(null);
    });
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [exportDoc, props.file]);

  const runImport = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const key = extractFileKey(url);
      if (!key) throw new Error("Paste a figma.com/design/… file URL.");
      if (!token.trim()) throw new Error("Paste a personal access token.");
      const file = await fetchFigmaFile(key, token.trim());
      const name = file.name ?? "Figma";
      setResult({ name, markdown: tokensToDesignMd(name, liftTokens(file)) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const closeImport = (open: boolean) => {
    setImportOpen(open);
    if (!open) {
      setToken("");
      setError(null);
      setResult(null);
    }
  };

  return (
    <>
      <Menu>
        <MenuTrigger render={<Button size="xs" variant="ghost" aria-label="Figma" />}>
          Figma
        </MenuTrigger>
        <MenuPopup align="end">
          <MenuItem
            disabled={props.html === null}
            onClick={() => {
              if (props.html === null) return;
              setStatus("Capturing…");
              setExportDoc(injectCaptureScript(props.html));
            }}
          >
            Download .fidesign-figma.json
          </MenuItem>
          <MenuItem onClick={() => setImportOpen(true)}>Import from Figma…</MenuItem>
        </MenuPopup>
      </Menu>
      {status ? (
        <span className="max-w-48 truncate text-muted-foreground text-xs" title={status}>
          {status}
        </span>
      ) : null}
      {exportDoc !== null ? (
        <iframe
          ref={frameRef}
          title="Figma capture"
          srcDoc={exportDoc}
          sandbox="allow-scripts"
          aria-hidden
          tabIndex={-1}
          style={{ position: "fixed", left: -10000, top: 0, width: 1280, height: 800, border: 0 }}
        />
      ) : null}
      <Dialog open={importOpen} onOpenChange={closeImport}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Import from Figma</DialogTitle>
            <DialogDescription>
              Lift colors, typography and spacing from a Figma file into a DESIGN.md.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-3 text-sm">
            <input
              aria-label="Figma file URL"
              placeholder="https://www.figma.com/design/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-8 w-full rounded-md bg-accent/50 px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <input
              aria-label="Figma personal access token"
              type="password"
              autoComplete="off"
              placeholder="Personal access token (file_content:read)"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="h-8 w-full rounded-md bg-accent/50 px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <p className="text-muted-foreground text-xs">
              The token is sent only to api.figma.com from this browser and is kept in memory until
              you close this dialog.
            </p>
            <p className="text-muted-foreground text-xs">
              Alternative: enable the official Figma MCP server (Dev Mode MCP, Figma desktop →
              Preferences → Enable Dev Mode MCP Server) and add it to your agent, then ask it to
              read the selected frame.
            </p>
            {error ? <p className="text-destructive text-xs">{error}</p> : null}
            {result ? (
              <pre className="max-h-48 overflow-auto rounded-md bg-muted/50 p-2 text-xs">
                {result.markdown}
              </pre>
            ) : null}
          </DialogPanel>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => closeImport(false)}>
              Close
            </Button>
            <Button size="sm" disabled={busy} onClick={runImport}>
              {busy ? "Importing…" : "Fetch"}
            </Button>
            {result && props.onUseAsDesignSystem ? (
              <Button
                size="sm"
                onClick={() => {
                  props.onUseAsDesignSystem?.(result.name, result.markdown);
                  closeImport(false);
                }}
              >
                Use as design system
              </Button>
            ) : null}
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
