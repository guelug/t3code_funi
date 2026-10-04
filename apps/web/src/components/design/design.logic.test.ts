import { describe, expect, it } from "vite-plus/test";

import { appendToPrompt, buildDesignBrief, exportFileName, isHtmlPath } from "./design.logic";
import { DESIGN_SYSTEMS, findDesignSystem } from "./designSystems";

describe("design logic", () => {
  it("bundles unique systems that carry the 9 sections", () => {
    expect(new Set(DESIGN_SYSTEMS.map((s) => s.id)).size).toBe(DESIGN_SYSTEMS.length);
    for (const system of DESIGN_SYSTEMS) {
      expect(system.markdown.match(/^## \d\./gm)).toHaveLength(9);
    }
    expect(findDesignSystem("funiber")?.markdown).toContain("#00699E");
    expect(findDesignSystem("nope")).toBeNull();
  });

  it("builds a brief that embeds the file path and design system", () => {
    const system = findDesignSystem("dark")!;
    const brief = buildDesignBrief({ system, file: "design/home.html" });
    expect(brief).toContain("`design/home.html`");
    expect(brief).toContain("<design-system>");
    expect(brief).toContain("Dark Studio");
  });

  it("names exports and appends prompts", () => {
    expect(exportFileName("a/b/page.html")).toBe("page.html");
    expect(exportFileName("a/readme")).toBe("readme.html");
    expect(isHtmlPath("x.HTM")).toBe(true);
    expect(appendToPrompt("  ", "x")).toBe("x");
    expect(appendToPrompt("a", "b")).toBe("a\n\nb");
  });
});
