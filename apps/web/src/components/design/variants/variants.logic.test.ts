import { describe, expect, it } from "vitest";

import { annotateSourcePaths } from "../edit/sourceHtml";
import {
  applyVariant,
  buildVariantsPrompt,
  extractFragment,
  listVariantFiles,
  tagOfSnippet,
  variantFileNames,
} from "./variants.logic";

const HTML = `<html><body>\n<h1>Hi</h1>\n<section class="a"><p>one</p></section>\n<footer>f</footer></body></html>`;
// indices: html0 body1 h1 2 section3 p4 footer5

describe("buildVariantsPrompt", () => {
  it("lists path, snippet, instruction and N files", () => {
    const out = buildVariantsPrompt({
      id: "vabc",
      file: "index.html",
      path: "3",
      tag: "section",
      snippet: '<section class="a"><p>one</p></section>',
      instruction: "bolder",
      count: 3,
    });
    expect(out).toContain("element #3");
    expect(out).toContain("bolder");
    expect(out).toContain("design/variants/vabc-a.html");
    expect(out).toContain("design/variants/vabc-c.html");
    expect(out).not.toContain("vabc-d");
    expect(out).toContain("Do NOT modify `index.html`");
  });
  it("names files and tags", () => {
    expect(variantFileNames("x", 2)).toEqual([
      "design/variants/x-a.html",
      "design/variants/x-b.html",
    ]);
    expect(tagOfSnippet(" <DIV a>")).toBe("div");
  });
});

describe("applyVariant", () => {
  it("replaces the outer element and keeps the rest byte-identical", () => {
    const r = applyVariant(HTML, "3", "<section><p>new</p></section>", { tag: "section" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const start = HTML.indexOf("<section");
    const end = HTML.indexOf("</section>") + 10;
    expect(r.html).toBe(HTML.slice(0, start) + "<section><p>new</p></section>" + HTML.slice(end));
  });
  it("refuses stale paths", () => {
    expect(applyVariant(HTML, "99", "<p/>").ok).toBe(false);
    expect(applyVariant(HTML, "2", "<p>x</p>", { tag: "section" }).ok).toBe(false);
    expect(applyVariant(HTML, "3", "<section/>", { snippet: '<section class="zzz">' }).ok).toBe(
      false,
    );
    expect(applyVariant(HTML, "x", "<p/>").ok).toBe(false);
  });
  it("accepts a matching snippet and handles void elements", () => {
    const h = `<div><img src="a.png"><p>x</p></div>`;
    const r = applyVariant(h, "1", `<img src="b.png">`, {
      tag: "img",
      snippet: `<img src="a.png">`,
    });
    expect(r).toEqual({ ok: true, html: `<div><img src="b.png"><p>x</p></div>` });
  });
  it("strips markers and body wrappers from fragments", () => {
    expect(
      extractFragment(
        `<html><body>\n<p data-fd-source-path="3" data-fd-selected>x</p>\n</body></html>`,
      ),
    ).toBe("<p>x</p>");
    const annotated = annotateSourcePaths(HTML);
    expect(annotated).toContain("data-fd-source-path");
  });
});

describe("listVariantFiles", () => {
  it("filters by id", () => {
    const entries = [
      { path: "design/variants/v1-a.html", kind: "file" },
      { path: "design/variants/v2-a.html", kind: "file" },
      { path: "design/variants/v1-a.png", kind: "file" },
    ];
    expect(listVariantFiles(entries, "v1")).toEqual(["design/variants/v1-a.html"]);
    expect(listVariantFiles(entries)).toHaveLength(2);
  });
});
