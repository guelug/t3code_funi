import { describe, expect, it } from "vite-plus/test";
import { buildDesignSystemPrompt } from "./designPrompt";
import { DESIGN_DIRECTIONS } from "./designDirections";
import { formatFormAnswers, parseQuestionForms } from "./questionForm";
import { listDesignSystemSummaries, loadDesignSystem } from "./designSystemsLoader";
import { CATALOG_INDEX } from "./designSystemsIndex";

describe("buildDesignSystemPrompt", () => {
  const prompt = buildDesignSystemPrompt({
    system: { id: "x", name: "Acme", markdown: "# DESIGN.md Acme\nPrimary #123456" },
    file: "design/index.html",
    request: "Landing",
  });
  it("composes rules, directions, system, target", () => {
    expect(prompt).toContain("RULE 1");
    expect(prompt).toContain("[form answers — discovery]");
    expect(prompt).toContain("Anti-AI-slop");
    for (const d of DESIGN_DIRECTIONS) expect(prompt).toContain(d.id);
    expect(prompt).toContain("## Active design system — Acme");
    expect(prompt).toContain("Primary #123456");
    expect(prompt).toContain("`design/index.html`");
    expect(prompt).toContain("Landing");
  });
  it("omits system block when none, avoids daemon tools as requirements", () => {
    const p = buildDesignSystemPrompt({ system: null, file: "a.html" });
    expect(p).not.toContain("## Active design system");
    expect(p).not.toContain("<artifact>");
  });
});

describe("question forms", () => {
  const text = `Dime:\n<question-form id="discovery" title="Brief">{"questions":[{"id":"o","label":"Qué","type":"radio","options":[{"label":"Landing","value":"landing"},"Deck"]},{"id":"a","label":"Para","type":"text"}]}</question-form>`;
  it("parses and formats", () => {
    const segs = parseQuestionForms(text);
    expect(segs.map((s) => s.kind)).toEqual(["text", "form"]);
    const form = (segs[1] as { form: Parameters<typeof formatFormAnswers>[0] }).form;
    expect(form.questions[0]!.options).toHaveLength(2);
    expect(formatFormAnswers(form, { o: "landing", a: "alumnos" })).toBe(
      "[form answers — discovery]\n- Qué (o): Landing [value: landing]\n- Para (a): alumnos",
    );
  });
  it("keeps invalid JSON as text and caps at 5", () => {
    expect(
      parseQuestionForms('<question-form id="d">{bad</question-form>').every(
        (s) => s.kind === "text",
      ),
    ).toBe(true);
    const qs = Array.from({ length: 8 }, (_, i) => ({ id: `q${i}`, label: "l", type: "text" }));
    const segs = parseQuestionForms(
      `<question-form id="d">${JSON.stringify({ questions: qs })}</question-form>`,
    );
    expect((segs[0] as unknown as { form: { questions: unknown[] } }).form.questions).toHaveLength(
      5,
    );
  });
});

describe("design systems loader", () => {
  it("lists >= 30 catalog + 4 originals, includes funiber", () => {
    const all = listDesignSystemSummaries();
    expect(CATALOG_INDEX.length).toBeGreaterThanOrEqual(30);
    expect(all.length).toBeGreaterThanOrEqual(34);
    expect(all[0]!.id).toBe("funiber");
  });
  it("lazy-loads every catalog file", async () => {
    for (const e of CATALOG_INDEX) {
      const s = await loadDesignSystem(e.id);
      expect(s?.markdown.length ?? 0).toBeGreaterThan(1000);
    }
    expect((await loadDesignSystem("funiber"))?.name).toBe("FUNIBER");
    expect(await loadDesignSystem("nope")).toBeNull();
  });
});
