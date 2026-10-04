/**
 * SPDX-License-Identifier: Apache-2.0
 * Port of Open Design's figma-extract (walkNode / liftTokens) adapted to emit a DESIGN.md.
 * Pure: no network, no storage. The access token never enters this module.
 */
export interface FigmaPaint {
  type: string;
  color?: { r: number; g: number; b: number; a?: number };
  opacity?: number;
  visible?: boolean;
}
export interface FigmaApiNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  children?: FigmaApiNode[];
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  cornerRadius?: number;
  characters?: string;
  style?: { fontFamily?: string; fontWeight?: number; fontSize?: number; lineHeightPx?: number };
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
}
export interface FigmaFileResponse {
  name?: string;
  document: FigmaApiNode;
}

export interface FigmaTokens {
  colors: { hex: string; count: number; roles: string[] }[];
  typography: {
    family: string;
    weight: number;
    size: number;
    lineHeight?: number;
    count: number;
  }[];
  spacing: number[];
  radius: number[];
  nodeCount: number;
}

const FILE_URL_RE = /^https:\/\/(?:www\.)?figma\.com\/(?:file|design|proto|board)\/([A-Za-z0-9]+)/;

export function extractFileKey(input: string): string | null {
  const trimmed = input.trim();
  const m = FILE_URL_RE.exec(trimmed);
  if (m) return m[1] ?? null;
  return /^[A-Za-z0-9]{10,}$/.test(trimmed) ? trimmed : null;
}

const toHex = (v: number) =>
  Math.max(0, Math.min(255, Math.round(v * 255)))
    .toString(16)
    .padStart(2, "0");

export function pickSolidColor(fills: FigmaPaint[] | undefined): string | undefined {
  for (const f of fills ?? []) {
    if (f.type !== "SOLID" || f.visible === false || !f.color) continue;
    const a = Math.max(0, Math.min(1, (f.color.a ?? 1) * (f.opacity ?? 1)));
    const hex = `#${toHex(f.color.r)}${toHex(f.color.g)}${toHex(f.color.b)}`.toUpperCase();
    return a < 1 ? hex + toHex(a).toUpperCase() : hex;
  }
  return undefined;
}

export function liftTokens(file: FigmaFileResponse): FigmaTokens {
  const colors = new Map<string, { count: number; roles: Set<string> }>();
  const type = new Map<string, FigmaTokens["typography"][number]>();
  const spacing = new Map<number, number>();
  const radius = new Map<number, number>();
  let nodeCount = 0;

  const addColor = (hex: string | undefined, role: string) => {
    if (!hex) return;
    const e = colors.get(hex) ?? { count: 0, roles: new Set<string>() };
    e.count += 1;
    e.roles.add(role);
    colors.set(hex, e);
  };
  const addNum = (map: Map<number, number>, v: number | undefined) => {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) map.set(v, (map.get(v) ?? 0) + 1);
  };

  const walk = (node: FigmaApiNode) => {
    if (node.visible === false) return;
    nodeCount += 1;
    if (node.type === "TEXT") {
      addColor(pickSolidColor(node.fills), "text");
      const s = node.style;
      if (s?.fontFamily && s.fontSize) {
        const weight = s.fontWeight ?? 400;
        const key = `${s.fontFamily}|${weight}|${s.fontSize}`;
        const e = type.get(key);
        if (e) e.count += 1;
        else {
          const entry: FigmaTokens["typography"][number] = {
            family: s.fontFamily,
            weight,
            size: s.fontSize,
            count: 1,
          };
          if (s.lineHeightPx) entry.lineHeight = Math.round(s.lineHeightPx * 10) / 10;
          type.set(key, entry);
        }
      }
    } else {
      addColor(
        pickSolidColor(node.fills),
        node.type === "CANVAS" || node.type === "DOCUMENT" ? "canvas" : "surface",
      );
    }
    addColor(pickSolidColor(node.strokes), "border");
    addNum(radius, node.cornerRadius);
    addNum(spacing, node.itemSpacing);
    for (const p of [node.paddingLeft, node.paddingRight, node.paddingTop, node.paddingBottom])
      addNum(spacing, p);
    for (const child of node.children ?? []) walk(child);
  };
  walk(file.document);

  const byCount = <T extends { count: number }>(a: T, b: T) => b.count - a.count;
  return {
    colors: [...colors.entries()]
      .map(([hex, v]) => ({ hex, count: v.count, roles: [...v.roles].sort() }))
      .sort(byCount)
      .slice(0, 16),
    typography: [...type.values()].sort(byCount).slice(0, 10),
    spacing: [...spacing.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([v]) => v)
      .sort((a, b) => a - b),
    radius: [...radius.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([v]) => v)
      .sort((a, b) => a - b),
    nodeCount,
  };
}

/** Renders tokens as a DESIGN.md in the same section shape as the bundled design systems. */
export function tokensToDesignMd(name: string, t: FigmaTokens): string {
  const lines: string[] = [
    `# DESIGN.md — ${name}`,
    "",
    "_Imported from Figma. Review before use._",
    "",
  ];
  lines.push("## 1. Palette");
  if (t.colors.length === 0) lines.push("- No solid colors found.");
  for (const c of t.colors) lines.push(`- ${c.hex} — ${c.roles.join("/")} (used ${c.count}×)`);
  lines.push("", "## 2. Typography");
  if (t.typography.length === 0) lines.push("- No text styles found.");
  for (const s of t.typography) {
    lines.push(
      `- ${s.family} ${s.weight} ${s.size}px${s.lineHeight ? ` / line-height ${s.lineHeight}px` : ""} (used ${s.count}×)`,
    );
  }
  lines.push("", "## 3. Spacing");
  lines.push(
    t.spacing.length
      ? `- Observed gaps/paddings (px): ${t.spacing.join(", ")}.`
      : "- No auto-layout spacing found; use a 4px grid.",
  );
  lines.push("", "## 4. Radius");
  lines.push(
    t.radius.length ? `- Corner radii (px): ${t.radius.join(", ")}.` : "- No corner radii found.",
  );
  lines.push(
    "",
    "## 5. Usage",
    "- Treat the palette and type scale above as the source of truth; do not introduce new colors or font sizes.",
    "",
  );
  return lines.join("\n");
}

/** Fetches the file JSON. Figma's REST API answers CORS with `access-control-allow-origin: *` and allows X-Figma-Token. */
export async function fetchFigmaFile(
  fileKey: string,
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<FigmaFileResponse> {
  const res = await fetchFn(`https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}`, {
    headers: { "X-Figma-Token": token },
  });
  if (!res.ok) {
    const hint =
      res.status === 403
        ? " (invalid token or no access to the file)"
        : res.status === 404
          ? " (file not found)"
          : "";
    throw new Error(`Figma API ${res.status}${hint}`);
  }
  return (await res.json()) as FigmaFileResponse;
}
