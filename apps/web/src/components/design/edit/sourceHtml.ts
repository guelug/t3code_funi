/**
 * Minimal offset-preserving HTML scanner + annotator. We deliberately avoid
 * DOMParser round-trips: re-serialising would reformat the user's file, while
 * offsets let the patcher touch only the bytes of one element.
 */
export const SOURCE_PATH_ATTR = "data-fd-source-path";

const VOID = new Set(
  "area base br col embed hr img input link meta param source track wbr".split(" "),
);
const RAW_TEXT = new Set(["script", "style", "textarea", "title"]);

export interface ScannedAttr {
  readonly name: string;
  /** Span of the value inside the quotes (or bare value); null when valueless. */
  readonly valueStart: number | null;
  readonly valueEnd: number | null;
}

export interface ScannedElement {
  readonly index: number;
  readonly name: string;
  readonly openStart: number;
  readonly openEnd: number;
  /** Offset right after the tag name (attribute insertion point). */
  readonly nameEnd: number;
  readonly attrs: readonly ScannedAttr[];
  /** Content span; null for void or never explicitly closed elements. */
  contentEnd: number | null;
  explicitClose: boolean;
  readonly parent: number;
}

export interface ScanResult {
  readonly elements: ScannedElement[];
  /** Text segments (outside tags, excluding raw-text bodies) with owning ancestor chain. */
  readonly texts: { start: number; end: number; ancestors: readonly number[] }[];
}

export function scanHtml(html: string): ScanResult {
  const elements: ScannedElement[] = [];
  const texts: ScanResult["texts"] = [];
  const stack: number[] = [];
  let i = 0;
  const n = html.length;
  const pushText = (start: number, end: number) => {
    if (end > start) texts.push({ start, end, ancestors: stack.slice() });
  };
  let textStart = 0;
  while (i < n) {
    if (html[i] !== "<") {
      i += 1;
      continue;
    }
    if (html.startsWith("<!--", i)) {
      pushText(textStart, i);
      const end = html.indexOf("-->", i + 4);
      i = end === -1 ? n : end + 3;
      textStart = i;
      continue;
    }
    const next = html[i + 1] ?? "";
    if (next === "!" || next === "?") {
      pushText(textStart, i);
      const end = html.indexOf(">", i);
      i = end === -1 ? n : end + 1;
      textStart = i;
      continue;
    }
    if (next === "/") {
      const m = /^<\/([a-zA-Z][^\s/>]*)\s*>/.exec(html.slice(i, i + 80));
      if (!m) {
        i += 1;
        continue;
      }
      pushText(textStart, i);
      const name = m[1]!.toLowerCase();
      const at = stack.findLastIndex((idx) => elements[idx]!.name === name);
      if (at !== -1) {
        for (let s = stack.length - 1; s >= at; s -= 1) {
          const el = elements[stack[s]!]!;
          el.contentEnd = i;
          el.explicitClose = s === at;
        }
        stack.length = at;
      }
      i += m[0].length;
      textStart = i;
      continue;
    }
    const nameMatch = /^<([a-zA-Z][^\s/>]*)/.exec(html.slice(i, i + 80));
    if (!nameMatch) {
      i += 1;
      continue;
    }
    pushText(textStart, i);
    const name = nameMatch[1]!.toLowerCase();
    const nameEnd = i + nameMatch[0].length;
    const attrs: ScannedAttr[] = [];
    let j = nameEnd;
    let selfClosing = false;
    while (j < n && html[j] !== ">") {
      const c = html[j]!;
      if (/\s/.test(c)) {
        j += 1;
        continue;
      }
      if (c === "/") {
        selfClosing = html[j + 1] === ">";
        j += 1;
        continue;
      }
      const attrStart = j;
      while (j < n && !/[\s=>/]/.test(html[j]!)) j += 1;
      const attrName = html.slice(attrStart, j).toLowerCase();
      let k = j;
      while (k < n && /\s/.test(html[k]!)) k += 1;
      if (html[k] === "=") {
        k += 1;
        while (k < n && /\s/.test(html[k]!)) k += 1;
        const q = html[k];
        if (q === '"' || q === "'") {
          const close = html.indexOf(q, k + 1);
          const end = close === -1 ? n : close;
          attrs.push({ name: attrName, valueStart: k + 1, valueEnd: end });
          j = close === -1 ? n : close + 1;
        } else {
          const vs = k;
          while (k < n && !/[\s>]/.test(html[k]!)) k += 1;
          attrs.push({ name: attrName, valueStart: vs, valueEnd: k });
          j = k;
        }
      } else {
        attrs.push({ name: attrName, valueStart: null, valueEnd: null });
      }
    }
    const openEnd = Math.min(j + 1, n);
    const el: ScannedElement = {
      index: elements.length,
      name,
      openStart: i,
      openEnd,
      nameEnd,
      attrs,
      contentEnd: null,
      explicitClose: false,
      parent: stack.length > 0 ? stack[stack.length - 1]! : -1,
    };
    elements.push(el);
    i = openEnd;
    textStart = i;
    if (VOID.has(name) || selfClosing) continue;
    if (RAW_TEXT.has(name)) {
      const close = new RegExp(`</${name}\\s*>`, "i").exec(html.slice(i));
      if (close) {
        el.contentEnd = i + close.index;
        el.explicitClose = true;
        i = i + close.index + close[0].length;
      } else {
        i = n;
      }
      textStart = i;
      continue;
    }
    stack.push(el.index);
  }
  pushText(textStart, n);
  return { elements, texts };
}

/** Insert `data-fd-source-path="<document-order index>"` on every element. */
export function annotateSourcePaths(html: string): string {
  const { elements } = scanHtml(html);
  let out = "";
  let cursor = 0;
  for (const el of elements) {
    if (el.attrs.some((attr) => attr.name === SOURCE_PATH_ATTR)) continue;
    out += html.slice(cursor, el.nameEnd) + ` ${SOURCE_PATH_ATTR}="${el.index}"`;
    cursor = el.nameEnd;
  }
  return out + html.slice(cursor);
}
