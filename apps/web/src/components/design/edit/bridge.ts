import { SOURCE_PATH_ATTR } from "./sourceHtml";
import type { FdEditPatch } from "./sourcePatch";

export type FdMode = "off" | "edit" | "comment";

/** iframe -> host */
export type FdBridgeMessage =
  | {
      readonly type: "fd-edit";
      readonly path: string;
      readonly kind: "text" | "style";
      readonly patch: FdEditPatch;
    }
  | { readonly type: "fd-select"; readonly path: string; readonly snippet: string };

export function parseBridgeMessage(data: unknown): FdBridgeMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  if (typeof m.path !== "string" || !/^\d+$/.test(m.path)) return null;
  if (m.type === "fd-select" && typeof m.snippet === "string") {
    return { type: "fd-select", path: m.path, snippet: m.snippet.slice(0, 400) };
  }
  if (m.type === "fd-edit" && typeof m.patch === "object" && m.patch !== null) {
    const p = m.patch as Record<string, unknown>;
    if (m.kind === "text" && p.kind === "text" && typeof p.text === "string") {
      return { type: "fd-edit", path: m.path, kind: "text", patch: { kind: "text", text: p.text } };
    }
    if (
      m.kind === "style" &&
      p.kind === "style" &&
      typeof p.style === "object" &&
      p.style !== null
    ) {
      const style: Record<string, string> = {};
      for (const [k, v] of Object.entries(p.style as Record<string, unknown>)) {
        if (typeof v === "string") style[k] = v;
      }
      return { type: "fd-edit", path: m.path, kind: "style", patch: { kind: "style", style } };
    }
  }
  return null;
}

/** Body of the injected script; runs inside the sandboxed (opaque-origin) iframe. */
function bridgeMain(attr: string): void {
  let mode: string = "off";
  let hover: Element | null = null;
  let selected: Element | null = null;
  let panel: HTMLElement | null = null;
  const send = (msg: unknown) => window.parent.postMessage(msg, "*");
  const style = document.createElement("style");
  style.setAttribute("data-fd-bridge-style", "");
  style.textContent =
    "[data-fd-hover]{outline:2px dashed #3b82f6!important;outline-offset:-2px}" +
    "[data-fd-selected]{outline:2px solid #2563eb!important;outline-offset:-2px}" +
    "[data-fd-editing]{cursor:text}";
  document.head.appendChild(style);

  const isHost = (el: Element | null) => !!el && !!el.closest("[data-fd-bridge-ui]");
  const target = (el: EventTarget | null): Element | null => {
    let node = el instanceof Element ? el : null;
    while (node && !node.hasAttribute(attr)) node = node.parentElement;
    return node && !isHost(node) ? node : null;
  };
  const clear = (key: string) =>
    document.querySelectorAll("[" + key + "]").forEach((n) => n.removeAttribute(key));
  const closePanel = () => {
    panel?.remove();
    panel = null;
  };
  const isTextLeaf = (el: Element) =>
    el.children.length === 0 && (el.textContent || "").trim() !== "";

  const commitText = (el: HTMLElement) => {
    el.removeAttribute("contenteditable");
    el.removeAttribute("data-fd-editing");
    const original = el.getAttribute("data-fd-original");
    el.removeAttribute("data-fd-original");
    const text = el.textContent || "";
    if (original !== null && text !== original) {
      send({
        type: "fd-edit",
        path: el.getAttribute(attr),
        kind: "text",
        patch: { kind: "text", text },
      });
    }
  };

  const openPanel = (el: HTMLElement) => {
    closePanel();
    const cs = getComputedStyle(el);
    const p = document.createElement("div");
    p.setAttribute("data-fd-bridge-ui", "");
    p.style.cssText =
      "position:fixed;right:8px;bottom:8px;z-index:2147483647;background:#fff;color:#111;font:12px system-ui;" +
      "border:1px solid #ccc;border-radius:8px;padding:8px;box-shadow:0 4px 16px rgba(0,0,0,.2);display:flex;gap:8px;align-items:center";
    const rgbToHex = (v: string) => {
      const m = /\d+/g.exec(v) && v.match(/\d+/g);
      if (!m || m.length < 3) return "#000000";
      return (
        "#" +
        m
          .slice(0, 3)
          .map((x) => Number(x).toString(16).padStart(2, "0"))
          .join("")
      );
    };
    const field = (
      label: string,
      input: HTMLInputElement,
      prop: string,
      fmt: (v: string) => string,
    ) => {
      const l = document.createElement("label");
      l.textContent = label + " ";
      l.appendChild(input);
      input.addEventListener("change", () =>
        send({
          type: "fd-edit",
          path: el.getAttribute(attr),
          kind: "style",
          patch: { kind: "style", style: { [prop]: fmt(input.value) } },
        }),
      );
      input.addEventListener("input", () => el.style.setProperty(prop, fmt(input.value)));
      p.appendChild(l);
    };
    const color = document.createElement("input");
    color.type = "color";
    color.value = rgbToHex(cs.color);
    field("Color", color, "color", (v) => v);
    const size = document.createElement("input");
    size.type = "number";
    size.min = "8";
    size.max = "120";
    size.style.width = "56px";
    size.value = String(Math.round(parseFloat(cs.fontSize)));
    field("Size", size, "font-size", (v) => v + "px");
    const pad = document.createElement("input");
    pad.type = "number";
    pad.min = "0";
    pad.max = "200";
    pad.style.width = "56px";
    pad.value = String(Math.round(parseFloat(cs.paddingTop)));
    field("Padding", pad, "padding", (v) => v + "px");
    document.body.appendChild(p);
    panel = p;
  };

  document.addEventListener(
    "mouseover",
    (e) => {
      if (mode === "off") return;
      const t = target(e.target);
      if (t === hover) return;
      clear("data-fd-hover");
      hover = t;
      t?.setAttribute("data-fd-hover", "");
    },
    true,
  );

  document.addEventListener(
    "click",
    (e) => {
      if (mode === "off") return;
      if (isHost(e.target instanceof Element ? e.target : null)) return;
      const t = target(e.target);
      if (!t) return;
      if (selected && selected !== t && selected.hasAttribute("data-fd-editing")) {
        commitText(selected as HTMLElement);
      }
      if (t.hasAttribute("data-fd-editing")) return; // let caret placement happen
      e.preventDefault();
      e.stopPropagation();
      clear("data-fd-selected");
      selected = t;
      t.setAttribute("data-fd-selected", "");
      if (mode === "comment") {
        send({
          type: "fd-select",
          path: t.getAttribute(attr),
          snippet: t.outerHTML.replace(/ data-fd-[a-z-]+(="[^"]*")?/g, "").slice(0, 400),
        });
        return;
      }
      const el = t as HTMLElement;
      if (isTextLeaf(el)) {
        el.setAttribute("data-fd-original", el.textContent || "");
        el.setAttribute("data-fd-editing", "");
        el.setAttribute("contenteditable", "plaintext-only");
        el.focus();
      }
      openPanel(el);
    },
    true,
  );

  // Keyboard guard: while editing, page shortcuts/handlers must not see keys.
  document.addEventListener(
    "keydown",
    (e) => {
      if (mode !== "edit" || !selected || !selected.hasAttribute("data-fd-editing")) return;
      e.stopPropagation();
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        commitText(selected as HTMLElement);
      }
    },
    true,
  );
  document.addEventListener(
    "focusout",
    (e) => {
      const t = e.target as HTMLElement;
      if (t.hasAttribute && t.hasAttribute("data-fd-editing")) commitText(t);
    },
    true,
  );

  window.addEventListener("message", (e) => {
    if (e.source !== window.parent) return;
    const d = e.data as { type?: string; mode?: string } | null;
    if (d && d.type === "fd-mode" && typeof d.mode === "string") {
      mode = d.mode;
      if (mode === "off") {
        if (selected?.hasAttribute("data-fd-editing")) commitText(selected as HTMLElement);
        clear("data-fd-hover");
        clear("data-fd-selected");
        closePanel();
        selected = null;
        hover = null;
      } else if (mode === "comment") closePanel();
    }
  });
}

/** `<script>` text to inject into the preview srcDoc. */
export function buildBridgeScript(): string {
  return `<script data-fd-bridge>(${bridgeMain.toString()})(${JSON.stringify(SOURCE_PATH_ATTR)});</script>`;
}

/** Build the srcDoc: annotated source plus the bridge (inserted before </body>). */
export function injectBridge(annotatedHtml: string): string {
  const script = buildBridgeScript();
  const at = annotatedHtml.search(/<\/body\s*>/i);
  return at === -1
    ? annotatedHtml + script
    : annotatedHtml.slice(0, at) + script + annotatedHtml.slice(at);
}
