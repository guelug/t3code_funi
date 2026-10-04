import { clipSnippet } from "../edit/comments";
import { scanHtml } from "../edit/sourceHtml";

export const VARIANTS_DIR = "design/variants";
export const DEFAULT_VARIANT_COUNT = 3;

export interface VariantRequest {
  /** Short id shared by all files of one request, e.g. `v1k2x`. */
  readonly id: string;
  readonly file: string;
  readonly path: string;
  readonly tag: string;
  readonly snippet: string;
  readonly instruction: string;
  readonly count: number;
}

export function newVariantId(now = Date.now()): string {
  return `v${now.toString(36).slice(-5)}`;
}

export function variantFileNames(id: string, count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => `${VARIANTS_DIR}/${id}-${String.fromCharCode(97 + i)}.html`,
  );
}

export function tagOfSnippet(snippet: string): string {
  return /^\s*<([a-zA-Z][^\s/>]*)/.exec(snippet)?.[1]?.toLowerCase() ?? "";
}

/** Structured composer message asking the agent for N alternatives of ONE element. */
export function buildVariantsPrompt(request: VariantRequest): string {
  const names = variantFileNames(request.id, request.count);
  return [
    `Design variants for \`${request.file}\`. Write ${request.count} alternative versions of ONLY the element below. Do NOT modify \`${request.file}\` or any other file.`,
    "",
    `element #${request.path} (\`data-fd-source-path\`, document-order index of start tags)`,
    `snippet: \`${clipSnippet(request.snippet).replace(/`/g, "'")}\``,
    `instruction: ${request.instruction.trim() || "explore distinct alternatives"}`,
    "",
    "Output files (one per variant, an HTML fragment containing just the replacement element, same outer tag `<" +
      (request.tag || "element") +
      ">`, inline styles or classes already in the page, no <html>/<body> wrapper, no data-fd-source-path):",
    ...names.map((name) => `- ${name}`),
    "",
    "Make the variants meaningfully different from each other and from the original.",
  ].join("\n");
}

export type ApplyVariantResult =
  | { readonly ok: true; readonly html: string }
  | { readonly ok: false; readonly reason: string };

const norm = (s: string) => s.replace(/\s+/g, " ").trim();

/** Fragment from a variant file: body inner if a full document, markers stripped. */
export function extractFragment(raw: string): string {
  const body = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(raw);
  const inner = (body ? body[1]! : raw).trim();
  return inner.replace(/\s+data-fd-(?:source-path|selected)(?:="[^"]*")?/g, "");
}

/**
 * Replace the whole outer element at `path` with `fragment`; every other byte of
 * `html` is preserved. Refuses when the path is stale: missing element, no
 * explicit end tag, tag differs from `expected.tag`, or the element's opening
 * text no longer matches the snippet captured at selection time.
 */
export function applyVariant(
  html: string,
  path: string,
  fragment: string,
  expected?: { readonly tag?: string; readonly snippet?: string },
): ApplyVariantResult {
  if (!/^\d+$/.test(path)) return { ok: false, reason: "invalid path" };
  const el = scanHtml(html).elements[Number(path)];
  if (!el) return { ok: false, reason: "element not found (stale path)" };
  if (expected?.tag && el.name !== expected.tag.toLowerCase()) {
    return { ok: false, reason: `stale path: element is now <${el.name}>` };
  }
  let end: number;
  const isVoid = el.contentEnd === null;
  if (isVoid) {
    end = el.openEnd;
  } else if (!el.explicitClose) {
    return { ok: false, reason: "element has no explicit closing tag" };
  } else {
    const close = html.indexOf(">", el.contentEnd!);
    if (close === -1) return { ok: false, reason: "malformed closing tag" };
    end = close + 1;
  }
  if (expected?.snippet) {
    const prefix = norm(expected.snippet).slice(0, 40);
    if (!norm(html.slice(el.openStart, end)).startsWith(prefix)) {
      return { ok: false, reason: "stale path: element content changed" };
    }
  }
  const next = extractFragment(fragment);
  if (next.length === 0) return { ok: false, reason: "empty variant" };
  return { ok: true, html: html.slice(0, el.openStart) + next + html.slice(end) };
}

/** Group listed workspace entries into variant files, newest request id last-first by name. */
export function listVariantFiles(
  entries: readonly { readonly path: string; readonly kind: string }[],
  id?: string,
): string[] {
  return entries
    .filter((e) => e.kind === "file" && /(^|\/)design\/variants\/[^/]+\.html$/.test(e.path))
    .map((e) => e.path)
    .filter((p) => id === undefined || p.includes(`/${id}-`) || p.includes(`variants/${id}-`))
    .toSorted();
}
