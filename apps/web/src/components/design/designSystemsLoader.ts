import { CATALOG_INDEX } from "./designSystemsIndex";
import { DESIGN_SYSTEMS, type DesignSystem } from "./designSystems";
import { useCustomDesignSystemsStore, type CustomDesignSystem } from "./customDesignSystemsStore";

/** Lazy per-file chunks: DESIGN.md bodies are NOT in the main bundle. */
const RAW = import.meta.glob<string>("./systems/*.md", { query: "?raw", import: "default" });

export interface DesignSystemSummary {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly category: string;
  readonly swatches: readonly string[];
}

/** Built-in originals first, then catalog (deduped by id). */
export function listDesignSystemSummaries(): readonly DesignSystemSummary[] {
  const own = new Set(DESIGN_SYSTEMS.map((s) => s.id));
  return [
    ...DESIGN_SYSTEMS.map((s) => ({
      id: s.id,
      name: s.name,
      summary: s.summary,
      category: "Funi Code",
      swatches: s.swatches,
    })),
    ...CATALOG_INDEX.filter((e) => !own.has(e.id)),
  ];
}

export async function loadDesignSystem(id: string): Promise<DesignSystem | null> {
  const custom = useCustomDesignSystemsStore.getState().systems.find((s) => s.id === id);
  if (custom)
    return {
      id: custom.id,
      name: custom.name,
      summary: "Custom",
      swatches: [],
      markdown: custom.markdown,
    };
  const builtin = DESIGN_SYSTEMS.find((s) => s.id === id);
  if (builtin) return builtin;
  const entry = CATALOG_INDEX.find((e) => e.id === id);
  const loader = RAW[`./systems/${id}.md`];
  if (!entry || !loader) return null;
  return {
    id: entry.id,
    name: entry.name,
    summary: entry.summary,
    swatches: entry.swatches,
    markdown: await loader(),
  };
}

/** Custom (user-saved / Figma-imported) systems, listed after built-ins in the picker. */
export function customSystemSummaries(
  systems: readonly CustomDesignSystem[],
): readonly DesignSystemSummary[] {
  return systems.map((s) => ({
    id: s.id,
    name: s.name,
    summary: "Custom",
    category: "Custom",
    swatches: [],
  }));
}
