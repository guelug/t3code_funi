import { buildZip, type ZipEntry } from "./zip";
import { buildPptx, extractSlides } from "./slides";

export function downloadBlob(name: string, data: unknown, type: string): void {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

const stem = (file: string) => (file.split(/[\\/]/).pop() ?? "design").replace(/\.html?$/i, "");

/** Relative (non-URL, non-absolute) src/href values referenced by the HTML. */
export function localAssetRefs(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const refs = new Set<string>();
  doc.querySelectorAll("[src], link[href]").forEach((el) => {
    const v = el.getAttribute("src") ?? el.getAttribute("href") ?? "";
    if (v && !/^([a-z][a-z0-9+.-]*:|\/|#|\/\/)/i.test(v)) refs.add(v.split(/[?#]/)[0]!);
  });
  return [...refs];
}

/**
 * ZIP = HTML + DESIGN.md + any local assets `readAsset` can resolve (workspace reader;
 * when omitted only HTML and DESIGN.md are bundled).
 */
export async function exportZip(input: {
  file: string;
  html: string;
  designMd: string | null;
  readAsset?: (relPath: string) => Promise<Uint8Array | null>;
}): Promise<void> {
  const entries: ZipEntry[] = [{ name: "index.html", data: input.html }];
  if (input.designMd) entries.push({ name: "DESIGN.md", data: input.designMd });
  if (input.readAsset) {
    for (const ref of localAssetRefs(input.html)) {
      const data = await input.readAsset(ref).catch(() => null);
      if (data) entries.push({ name: ref.replace(/^(\.\/)+/, ""), data });
    }
  }
  downloadBlob(`${stem(input.file)}.zip`, buildZip(entries), "application/zip");
}

/**
 * PDF: no desktop print/PDF bridge exists (no printToPDF in apps/desktop), so print a
 * hidden same-origin srcDoc iframe through the system print dialog ("Save as PDF").
 * Limits: user-driven dialog, browser pagination, backgrounds need "Background graphics".
 */
export function exportPdf(html: string): void {
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  frame.srcdoc = html;
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}

/** Text-only PPTX. Returns false when no deck-like sections are found. */
export function exportPptx(file: string, html: string): boolean {
  const slides = extractSlides(html);
  if (slides.length === 0) return false;
  downloadBlob(
    `${stem(file)}.pptx`,
    buildPptx(slides),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  );
  return true;
}
