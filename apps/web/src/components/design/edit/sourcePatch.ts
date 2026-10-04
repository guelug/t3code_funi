import { scanHtml } from "./sourceHtml";

export type FdEditPatch =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "style"; readonly style: Readonly<Record<string, string>> };

export type PatchResult =
  | { readonly ok: true; readonly html: string }
  | { readonly ok: false; readonly reason: string };

const PROP_RE = /^[a-z-]{1,40}$/;
const VALUE_RE = /^[^;{}<>"'\\]{0,80}$/;

function escapeText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function splitDeclarations(value: string): [string, string][] {
  const out: [string, string][] = [];
  let depth = 0;
  let quote = "";
  let buf = "";
  const flush = () => {
    const at = buf.indexOf(":");
    if (at > 0) out.push([buf.slice(0, at).trim().toLowerCase(), buf.slice(at + 1).trim()]);
    buf = "";
  };
  for (const c of value) {
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth += 1;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) {
      flush();
      continue;
    }
    buf += c;
  }
  flush();
  return out;
}

/** Apply one text/style patch to the element whose source index is `path`. */
export function applyEditPatch(html: string, path: string, patch: FdEditPatch): PatchResult {
  if (!/^\d+$/.test(path)) return { ok: false, reason: "invalid path" };
  const scan = scanHtml(html);
  const el = scan.elements[Number(path)];
  if (!el) return { ok: false, reason: "element not found" };

  if (patch.kind === "text") {
    if (el.contentEnd === null || !el.explicitClose) {
      return { ok: false, reason: "element has no explicit closing tag" };
    }
    const nodes = scan.texts.filter(
      (t) =>
        t.start >= el.openEnd &&
        t.end <= el.contentEnd! &&
        t.ancestors.includes(el.index) &&
        html.slice(t.start, t.end).trim().length > 0,
    );
    if (nodes.length !== 1) {
      return {
        ok: false,
        reason: nodes.length === 0 ? "no text to edit" : "ambiguous: several text nodes",
      };
    }
    const node = nodes[0]!;
    const old = html.slice(node.start, node.end);
    const lead = /^\s*/.exec(old)![0];
    const trail = /\s*$/.exec(old)![0];
    return {
      ok: true,
      html:
        html.slice(0, node.start) +
        lead +
        escapeText(patch.text.trim()) +
        trail +
        html.slice(node.end),
    };
  }

  const entries = Object.entries(patch.style);
  if (entries.length === 0) return { ok: false, reason: "empty style patch" };
  for (const [prop, value] of entries) {
    if (!PROP_RE.test(prop) || !VALUE_RE.test(value)) {
      return { ok: false, reason: `unsafe style ${prop}` };
    }
  }
  const attr = el.attrs.find((a) => a.name === "style");
  const decls = new Map(
    attr?.valueStart != null ? splitDeclarations(html.slice(attr.valueStart, attr.valueEnd!)) : [],
  );
  for (const [prop, value] of entries) {
    if (value.trim() === "") decls.delete(prop);
    else decls.set(prop, value.trim());
  }
  const serialized = [...decls].map(([p, v]) => `${p}: ${v.replace(/"/g, "'")}`).join("; ");
  if (attr?.valueStart != null) {
    // Replace the whole attribute including its quotes (or bare value).
    const quoted = /["']/.test(html[attr.valueStart - 1] ?? "");
    const start = quoted ? attr.valueStart - 1 : attr.valueStart;
    const end = quoted ? attr.valueEnd! + 1 : attr.valueEnd!;
    return { ok: true, html: `${html.slice(0, start)}"${serialized}"${html.slice(end)}` };
  }
  if (attr) {
    // Valueless `style` attribute: insert a value right after its name.
    return { ok: false, reason: "valueless style attribute" };
  }
  return {
    ok: true,
    html: `${html.slice(0, el.nameEnd)} style="${serialized}"${html.slice(el.nameEnd)}`,
  };
}
