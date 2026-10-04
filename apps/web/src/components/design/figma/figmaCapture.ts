/** SPDX-License-Identifier: Apache-2.0 (schema derived from Open Design figma-plugin/IR.md). */
import { CAPTURE_MESSAGE_RESULT, CAPTURE_SCRIPT } from "./capture.script";

export const CAPTURE_FILE_SUFFIX = ".fidesign-figma.json";

export interface FigmaCaptureNode {
  type: "FRAME" | "TEXT" | "RECTANGLE";
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  children?: FigmaCaptureNode[];
  characters?: string;
  fontFamily?: string;
  fontStyle?: string;
  fontSize?: number;
  [key: string]: unknown;
}
export interface FigmaCapture {
  version: 1;
  source: {
    url: string;
    title: string;
    capturedAt: number;
    viewport: { width: number; height: number };
    dpr: number;
  };
  fonts: { family: string; styles: string[] }[];
  root: FigmaCaptureNode;
}

/** Inserts the capture script into an HTML document string (before </body>, else appended). */
export function injectCaptureScript(html: string): string {
  const tag = `<script>${CAPTURE_SCRIPT.replace(/<\/script/gi, "<\\/script")}</script>`;
  const idx = html.search(/<\/body\s*>/i);
  return idx === -1 ? html + tag : html.slice(0, idx) + tag + html.slice(idx);
}

/** Validates the shape of a capture (IR.md contract). Returns null when valid, else a reason. */
export function validateCapture(value: unknown): string | null {
  const c = value as Partial<FigmaCapture> | null;
  if (!c || typeof c !== "object") return "not an object";
  if (c.version !== 1) return "version must be 1";
  if (!c.source || typeof c.source.title !== "string") return "missing source";
  if (!Array.isArray(c.fonts)) return "missing fonts";
  const check = (n: unknown, path: string): string | null => {
    const node = n as FigmaCaptureNode;
    if (!node || typeof node !== "object") return `${path}: not a node`;
    if (node.type !== "FRAME" && node.type !== "TEXT" && node.type !== "RECTANGLE")
      return `${path}: bad type`;
    for (const k of ["x", "y", "width", "height"] as const) {
      if (typeof node[k] !== "number" || !Number.isFinite(node[k])) return `${path}: bad ${k}`;
    }
    if (node.type === "TEXT") {
      if (
        typeof node.characters !== "string" ||
        typeof node.fontFamily !== "string" ||
        typeof node.fontSize !== "number"
      ) {
        return `${path}: incomplete TEXT`;
      }
    }
    for (const [i, child] of (node.children ?? []).entries()) {
      const err = check(child, `${path}.children[${i}]`);
      if (err) return err;
    }
    return null;
  };
  return check(c.root, "root");
}

/**
 * Listens for the capture result from `frame`. Only messages whose `source` is the
 * iframe's contentWindow are accepted (the iframe has an opaque origin).
 */
export function listenForCapture(
  frame: HTMLIFrameElement,
  onResult: (result: { capture: FigmaCapture } | { error: string }) => void,
): () => void {
  const handler = (event: MessageEvent) => {
    if (event.source === null || event.source !== frame.contentWindow) return;
    const data = event.data as { type?: unknown; ir?: unknown; error?: unknown } | null;
    if (!data || data.type !== CAPTURE_MESSAGE_RESULT) return;
    if (typeof data.error === "string" && data.error) return onResult({ error: data.error });
    const reason = validateCapture(data.ir);
    if (reason) return onResult({ error: `Invalid capture: ${reason}` });
    onResult({ capture: data.ir as FigmaCapture });
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

export function captureFileName(file: string): string {
  const base = (file.split("/").pop() ?? "design").replace(/\.[^.]+$/, "") || "design";
  return `${base}${CAPTURE_FILE_SUFFIX}`;
}
