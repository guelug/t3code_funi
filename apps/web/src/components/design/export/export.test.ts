import { describe, expect, it } from "vite-plus/test";

import { buildPptx } from "./slides";
import { buildZip, crc32, readZip } from "./zip";

describe("zip", () => {
  it("crc32 matches known vector", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("round-trips via central directory", () => {
    const bin = new Uint8Array([0, 1, 2, 255]);
    const zip = buildZip([
      { name: "a.html", data: "<p>héllo</p>" },
      { name: "img/b.bin", data: bin },
    ]);
    const files = readZip(zip);
    expect(files.map((f) => f.name)).toEqual(["a.html", "img/b.bin"]);
    expect(new TextDecoder().decode(files[0]!.data)).toBe("<p>héllo</p>");
    expect([...files[1]!.data]).toEqual([...bin]);
    expect(files[1]!.crc).toBe(crc32(bin));
  });
});

describe("pptx", () => {
  it("builds a pptx with required parts and escaped text", () => {
    const files = readZip(
      buildPptx([
        { title: "One & Co", paragraphs: ["Alpha", "<x>"] },
        { title: "Two", paragraphs: [] },
      ]),
    );
    const names = files.map((f) => f.name);
    for (const n of [
      "[Content_Types].xml",
      "_rels/.rels",
      "ppt/presentation.xml",
      "ppt/_rels/presentation.xml.rels",
      "ppt/slideMasters/slideMaster1.xml",
      "ppt/slideLayouts/slideLayout1.xml",
      "ppt/theme/theme1.xml",
      "ppt/slides/slide1.xml",
      "ppt/slides/slide2.xml",
      "ppt/slides/_rels/slide2.xml.rels",
    ])
      expect(names).toContain(n);
    const xml = new TextDecoder().decode(
      files.find((f) => f.name === "ppt/slides/slide1.xml")!.data,
    );
    expect(xml).toContain("One &amp; Co");
    expect(xml).toContain("&lt;x&gt;");
    const pres = new TextDecoder().decode(
      files.find((f) => f.name === "ppt/presentation.xml")!.data,
    );
    expect(pres.match(/<p:sldId /g)).toHaveLength(2);
  });
});
