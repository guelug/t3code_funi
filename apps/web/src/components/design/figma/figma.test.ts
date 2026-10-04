// @ts-expect-error jsdom ships no types in this workspace
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vite-plus/test";

import { CAPTURE_SCRIPT } from "./capture.script";
import { injectCaptureScript, validateCapture } from "./figmaCapture";
import {
  extractFileKey,
  liftTokens,
  pickSolidColor,
  tokensToDesignMd,
  type FigmaFileResponse,
} from "./figmaImport";

function runCapture(html: string) {
  const dom = new JSDOM(`<!DOCTYPE html><html>${html}</html>`, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  const w = dom.window as unknown as Window &
    typeof globalThis & { __fidesignCapture: () => unknown };
  const rect = (l: number, t: number, wd: number, h: number) => ({
    left: l,
    top: t,
    width: wd,
    height: h,
    right: l + wd,
    bottom: t + h,
    x: l,
    y: t,
  });
  w.Element.prototype.getBoundingClientRect = function (this: Element) {
    return (this.tagName === "BODY" ? rect(0, 0, 800, 600) : rect(10, 20, 200, 40)) as DOMRect;
  };
  w.Range.prototype.getBoundingClientRect = () => rect(12, 22, 80, 18) as DOMRect;
  w.eval(CAPTURE_SCRIPT);
  return w.__fidesignCapture();
}

describe("capture script", () => {
  it("produces an IR.md-shaped tree", () => {
    const ir = runCapture(
      `<head><title>T</title></head><body style="background:#fff"><div id="hero" style="background:rgb(255,0,0);border:2px solid rgb(0,0,255);border-top-left-radius:8px;border-top-right-radius:8px;border-bottom-right-radius:8px;border-bottom-left-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.2)"><h1 style="font-family:Inter, sans-serif;font-weight:700;font-size:20px">Hello</h1></div></body>`,
    ) as {
      fonts: { family: string; styles: string[] }[];
      root: { children: Record<string, unknown>[] };
    };
    expect(validateCapture(ir)).toBeNull();
    const hero = ir.root.children[0]!;
    expect(hero.name).toBe("div#hero");
    expect(hero.fills).toEqual([{ type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 1 }]);
    expect(hero.strokeWeight).toBe(2);
    expect(hero.cornerRadius).toBe(8);
    expect((hero.effects as { type: string }[])[0]!.type).toBe("DROP_SHADOW");
    const text = (hero.children as Record<string, unknown>[])[0]!.children as Record<
      string,
      unknown
    >[];
    expect(text[0]).toMatchObject({
      type: "TEXT",
      characters: "Hello",
      fontFamily: "Inter",
      fontStyle: "Bold",
      fontSize: 20,
    });
    expect(ir.fonts).toEqual([{ family: "Inter", styles: ["Bold"] }]);
  });

  it("injects before </body> and rejects bad captures", () => {
    expect(injectCaptureScript("<body>x</body>")).toMatch(/<script>[\s\S]*<\/script><\/body>/);
    expect(validateCapture({ version: 2 })).toBe("version must be 1");
    expect(
      validateCapture({ version: 1, source: { title: "" }, fonts: [], root: { type: "TEXT" } }),
    ).toMatch(/bad x/);
  });
});

describe("figma import", () => {
  const file: FigmaFileResponse = {
    name: "Brand",
    document: {
      id: "0:0",
      name: "Doc",
      type: "DOCUMENT",
      children: [
        {
          id: "1:1",
          name: "Frame",
          type: "FRAME",
          cornerRadius: 12,
          itemSpacing: 16,
          paddingLeft: 24,
          fills: [{ type: "SOLID", color: { r: 0, g: 0.41, b: 0.62 } }],
          children: [
            {
              id: "1:2",
              name: "T",
              type: "TEXT",
              characters: "Hi",
              fills: [{ type: "SOLID", color: { r: 0.1, g: 0.1, b: 0.1 } }],
              style: { fontFamily: "Inter", fontWeight: 600, fontSize: 24, lineHeightPx: 32 },
            },
            {
              id: "1:3",
              name: "Hidden",
              type: "FRAME",
              visible: false,
              fills: [{ type: "SOLID", color: { r: 1, g: 0, b: 0 } }],
            },
          ],
        },
      ],
    },
  };
  it("parses keys and colors", () => {
    expect(extractFileKey("https://www.figma.com/design/AbC123xyz9/Name?node-id=1")).toBe(
      "AbC123xyz9",
    );
    expect(extractFileKey("nope")).toBeNull();
    expect(pickSolidColor([{ type: "SOLID", color: { r: 1, g: 0, b: 0, a: 0.5 } }])).toBe(
      "#FF000080",
    );
  });
  it("lifts tokens into DESIGN.md and skips hidden nodes", () => {
    const t = liftTokens(file);
    expect(t.colors.map((c) => c.hex)).not.toContain("#FF0000");
    expect(t.radius).toEqual([12]);
    expect(t.spacing).toEqual([16, 24]);
    const md = tokensToDesignMd("Brand", t);
    expect(md).toContain("# DESIGN.md — Brand");
    expect(md).toContain("Inter 600 24px / line-height 32px");
  });
});
