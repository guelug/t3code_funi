import type { DesignSystem } from "./designSystems";

export const DESIGN_DEVICES = [
  { id: "desktop", label: "Desktop", width: null },
  { id: "tablet", label: "Tablet", width: 768 },
  { id: "mobile", label: "Mobile", width: 390 },
] as const;

export type DesignDeviceId = (typeof DESIGN_DEVICES)[number]["id"];

export const DEFAULT_DESIGN_FILE = "design/index.html";

export function isHtmlPath(path: string): boolean {
  return /\.html?$/i.test(path.trim());
}

/**
 * Prompt text appended to the composer when the user applies a design system.
 * The DESIGN.md travels inline so it works on every provider and remote
 * environment without the agent needing a file in the workspace.
 */
export function buildDesignBrief(input: {
  readonly system: DesignSystem;
  readonly file: string;
}): string {
  return [
    `Design task: write a single self-contained HTML file at \`${input.file}\` (inline CSS, no external requests, responsive, semantic HTML).`,
    `Follow this design system exactly and avoid its anti-patterns:`,
    "",
    "<design-system>",
    input.system.markdown.trim(),
    "</design-system>",
  ].join("\n");
}

/** Suggested download name for an exported artifact. */
export function exportFileName(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? "design.html";
  return isHtmlPath(base) ? base : `${base}.html`;
}

export function appendToPrompt(current: string, addition: string): string {
  return current.trim().length === 0 ? addition : `${current}\n\n${addition}`;
}
