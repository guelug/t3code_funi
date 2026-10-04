// @ts-expect-error jsdom ships no bundled types here
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vite-plus/test";

import { extractSlides } from "./slides";

// The jsdom vitest environment is unavailable here; install DOMParser manually.
(globalThis as { DOMParser?: unknown }).DOMParser = new JSDOM("").window.DOMParser;

describe("extractSlides", () => {
  const html = `<body><section><h1>One &amp; Co</h1><p>Alpha</p><ul><li>x</li></ul></section><section><h2>Two</h2><p>Beta</p></section></body>`;
  it("extracts body sections and .slide elements", () => {
    expect(extractSlides(html)).toEqual([
      { title: "One & Co", paragraphs: ["Alpha", "x"] },
      { title: "Two", paragraphs: ["Beta"] },
    ]);
    expect(extractSlides(`<div class="slide"><h1>A</h1></div><div slide>B</div>`)).toHaveLength(2);
    expect(extractSlides("<p>nothing</p>")).toEqual([]);
  });
});
