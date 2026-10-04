import { describe, expect, it } from "vite-plus/test";

import { annotateSourcePaths } from "./sourceHtml";
import { applyEditPatch } from "./sourcePatch";
import { clipSnippet, formatCommentsMessage } from "./comments";
import { injectBridge, parseBridgeMessage } from "./bridge";

const SRC = `<!doctype html>
<html><head><style>p{color:red}</style><script>var a="<b>x</b>";</script></head>
<body><h1 class="t">Hello</h1>
<p>One <b>two</b></p>
<ul><li>A</li><li>A</li></ul><img src="x.png"><button style="color: blue; padding: 4px">Go</button></body></html>`;

const idx = (name: string, nth = 0) => {
  const tags = [
    ...SRC.replace(/<(script|style)>.*?<\/\1>/gs, (m, t) => `<${t}></${t}>`).matchAll(
      /<([a-z0-9]+)/gi,
    ),
  ].map((m) => m[1]!.toLowerCase());
  let seen = -1;
  for (let i = 0; i < tags.length; i += 1) if (tags[i] === name && ++seen === nth) return String(i);
  throw new Error(name);
};

describe("annotateSourcePaths", () => {
  it("tags every element in document order, ignoring script/style bodies", () => {
    const out = annotateSourcePaths(SRC);
    expect(out).toContain(`<h1 data-fd-source-path="${idx("h1")}" class="t">Hello</h1>`);
    expect(out).not.toContain('<b data-fd-source-path="x"');
    expect(out.match(/data-fd-source-path/g)?.length).toBe(
      SRC.replace(/<(script|style)>.*?<\/\1>/gs, "<$1></$1>").match(/<[a-z][a-z0-9]*/gi)!.length,
    );
    expect(out.replace(/ data-fd-source-path="\d+"/g, "")).toBe(SRC);
  });
});

describe("applyEditPatch text", () => {
  it("round-trips a leaf edit and escapes", () => {
    const r = applyEditPatch(SRC, idx("h1"), { kind: "text", text: "Hi <you> & me" });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) {
      expect(r.html).toContain('<h1 class="t">Hi &lt;you&gt; &amp; me</h1>');
      expect(r.html.replace("Hi &lt;you&gt; &amp; me", "Hello")).toBe(SRC);
    }
  });
  it("targets only the chosen of two identical siblings", () => {
    const r = applyEditPatch(SRC, idx("li", 1), { kind: "text", text: "B" });
    expect(r.ok && r.html).toContain("<li>A</li><li>B</li>");
  });
  it("refuses ambiguous mixed markup", () => {
    expect(applyEditPatch(SRC, idx("p"), { kind: "text", text: "x" })).toMatchObject({ ok: false });
  });
  it("edits through nested wrapper with a single text node", () => {
    const html = "<div><span><i></i>Label</span></div>";
    const r = applyEditPatch(html, "0", { kind: "text", text: "New" });
    expect(r.ok && r.html).toBe("<div><span><i></i>New</span></div>");
  });
  it("refuses void elements and bad paths", () => {
    expect(applyEditPatch(SRC, idx("img"), { kind: "text", text: "x" })).toMatchObject({
      ok: false,
    });
    expect(applyEditPatch(SRC, "999", { kind: "text", text: "x" })).toMatchObject({ ok: false });
    expect(applyEditPatch(SRC, "a", { kind: "text", text: "x" })).toMatchObject({ ok: false });
  });
});

describe("applyEditPatch style", () => {
  it("adds a style attribute", () => {
    const r = applyEditPatch(SRC, idx("h1"), { kind: "style", style: { color: "#ff0000" } });
    expect(r.ok && r.html).toContain('<h1 style="color: #ff0000" class="t">');
  });
  it("merges into an existing style attribute", () => {
    const r = applyEditPatch(SRC, idx("button"), {
      kind: "style",
      style: { color: "red", "font-size": "20px" },
    });
    expect(r.ok && r.html).toContain('style="color: red; padding: 4px; font-size: 20px"');
  });
  it("rejects unsafe values", () => {
    const r = applyEditPatch(SRC, idx("h1"), {
      kind: "style",
      style: { color: 'red" onclick="x' },
    });
    expect(r).toMatchObject({ ok: false });
  });
});

describe("bridge + comments", () => {
  it("parses only well-formed messages", () => {
    expect(parseBridgeMessage({ type: "fd-select", path: "3", snippet: "<p>" })).toMatchObject({
      path: "3",
    });
    expect(
      parseBridgeMessage({
        type: "fd-edit",
        path: "x",
        kind: "text",
        patch: { kind: "text", text: "a" },
      }),
    ).toBeNull();
    expect(
      parseBridgeMessage({
        type: "fd-edit",
        path: "1",
        kind: "text",
        patch: { kind: "style", style: {} },
      }),
    ).toBeNull();
    expect(parseBridgeMessage(null)).toBeNull();
  });
  it("injects the bridge before </body>", () => {
    const out = injectBridge("<body><p>x</p></body>");
    expect(out.indexOf("data-fd-bridge")).toBeLessThan(out.indexOf("</body>"));
    expect(out).toContain('"data-fd-source-path"');
  });
  it("formats comments", () => {
    const msg = formatCommentsMessage("design/index.html", [
      { id: "1", path: "4", snippet: "<h1>  Hi\n</h1>", note: "Make bigger" },
    ]);
    expect(msg).toContain("element #4");
    expect(msg).toContain("note: Make bigger");
    expect(clipSnippet("a".repeat(500)).length).toBe(161);
  });
});
