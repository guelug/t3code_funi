import { describe, expect, it } from "@effect/vitest";

import { buildSocketUrl } from "./connection.ts";
import {
  type ChatProvider,
  filterByQuery,
  isApprovalYes,
  parseModelRef,
  parsePick,
  parseSlashCommand,
  relativeTime,
  resolveModelRef,
  toMillis,
  TurnItemRenderer,
  unescapeMessage,
  usableProviders,
} from "./logic.ts";

const provider = (overrides: Partial<ChatProvider>): ChatProvider => ({
  instanceId: "codex",
  driver: "codex",
  enabled: true,
  installed: true,
  status: "ready",
  models: [
    { slug: "gpt-5.5", name: "GPT-5.5" },
    { slug: "gpt-6-luna", name: "GPT-6-Luna", isDefault: true },
  ],
  ...overrides,
});

describe("parseModelRef", () => {
  it("splits on the first slash so model slugs may contain slashes", () => {
    expect(parseModelRef("codex/gpt-5.5")).toEqual({ instanceId: "codex", model: "gpt-5.5" });
    expect(parseModelRef("acpRegistry_hermes/openrouter/x-ai/grok")).toEqual({
      instanceId: "acpRegistry_hermes",
      model: "openrouter/x-ai/grok",
    });
  });
  it("accepts a bare instance and rejects empties", () => {
    expect(parseModelRef(" codex ")).toEqual({ instanceId: "codex", model: null });
    expect(parseModelRef("codex/")).toEqual({ instanceId: "codex", model: null });
    expect(parseModelRef("")).toBeNull();
    expect(parseModelRef("/gpt")).toBeNull();
  });
});

describe("resolveModelRef", () => {
  const providers = [
    provider({}),
    provider({
      instanceId: "acpRegistry_hermes",
      driver: "acpRegistry",
      displayName: "Rebe · default",
      models: [{ slug: "claude-sonnet", name: "Claude Sonnet" }],
    }),
  ];
  it("resolves by instance id, display name, and model name", () => {
    expect(resolveModelRef(providers, { instanceId: "CODEX", model: "GPT-5.5" })).toEqual({
      _tag: "resolved",
      instanceId: "codex",
      model: "gpt-5.5",
    });
    expect(
      resolveModelRef(providers, { instanceId: "rebe · default", model: "claude-sonnet" }),
    ).toMatchObject({ _tag: "resolved", instanceId: "acpRegistry_hermes" });
  });
  it("reports what is missing", () => {
    expect(resolveModelRef(providers, { instanceId: "nope", model: null })._tag).toBe(
      "unknownProvider",
    );
    expect(resolveModelRef(providers, { instanceId: "codex", model: null })._tag).toBe(
      "needsModel",
    );
    expect(resolveModelRef(providers, { instanceId: "codex", model: "gpt-9" })._tag).toBe(
      "unknownModel",
    );
  });
});

describe("usableProviders", () => {
  it("drops disabled, uninstalled, model-less and unavailable providers; ready first", () => {
    const result = usableProviders([
      provider({ instanceId: "a", status: "warning" }),
      provider({ instanceId: "b", enabled: false }),
      provider({ instanceId: "c", installed: false }),
      provider({ instanceId: "d", models: [] }),
      provider({ instanceId: "e", availability: "unavailable" }),
      provider({ instanceId: "f" }),
    ]);
    expect(result.map((p) => p.instanceId)).toEqual(["f", "a"]);
  });
});

describe("pickers and commands", () => {
  it("parses numbered picks within range", () => {
    expect(parsePick("2", 3)).toBe(1);
    expect(parsePick(" 3 ", 3)).toBe(2);
    expect(parsePick("0", 3)).toBeNull();
    expect(parsePick("4", 3)).toBeNull();
    expect(parsePick("gpt", 3)).toBeNull();
  });
  it("filters case-insensitively", () => {
    expect(filterByQuery(["Rebe · default", "Codex"], "REBE", (x) => x)).toEqual([
      "Rebe · default",
    ]);
    expect(filterByQuery(["a", "b"], "  ", (x) => x)).toEqual(["a", "b"]);
  });
  it("parses slash commands and aliases", () => {
    expect(parseSlashCommand("/model codex/gpt-5.5")).toEqual({
      _tag: "model",
      arg: "codex/gpt-5.5",
    });
    expect(parseSlashCommand("/model")).toEqual({ _tag: "model", arg: null });
    expect(parseSlashCommand("/new")).toEqual({ _tag: "new" });
    expect(parseSlashCommand("/threads")).toEqual({ _tag: "threads" });
    expect(parseSlashCommand("/exit")).toEqual({ _tag: "quit" });
    expect(parseSlashCommand("/foo")).toEqual({ _tag: "unknown", name: "foo" });
    expect(parseSlashCommand("hello /model")).toBeNull();
    expect(parseSlashCommand("//etc/hosts?")).toBeNull();
    expect(unescapeMessage("//etc/hosts?")).toBe("/etc/hosts?");
  });
  it("reads approval answers", () => {
    expect(isApprovalYes("Y")).toBe(true);
    expect(isApprovalYes("sí")).toBe(true);
    expect(isApprovalYes("no")).toBe(false);
    expect(isApprovalYes("maybe")).toBeNull();
  });
});

describe("TurnItemRenderer", () => {
  const base = { id: "i1", status: "running" };
  it("streams assistant text as deltas of the full snapshot", () => {
    const r = new TurnItemRenderer();
    expect(r.render({ ...base, type: "assistant_message", text: "Hel" })).toEqual([
      { kind: "text", itemId: "i1", delta: "Hel" },
    ]);
    expect(r.render({ ...base, type: "assistant_message", text: "Hello" })).toEqual([
      { kind: "text", itemId: "i1", delta: "lo" },
    ]);
    expect(r.render({ ...base, type: "assistant_message", text: "Hello" })).toEqual([]);
  });
  it("does not replay seeded history", () => {
    const r = new TurnItemRenderer();
    r.seed([{ ...base, type: "assistant_message", text: "old", status: "completed" }]);
    expect(r.render({ ...base, type: "assistant_message", text: "old" })).toEqual([]);
    expect(r.render({ ...base, type: "assistant_message", text: "old!" })).toEqual([
      { kind: "text", itemId: "i1", delta: "!" },
    ]);
  });
  it("shows a tool once when started and once when finished", () => {
    const r = new TurnItemRenderer();
    const cmd = { ...base, type: "command_execution", input: "ls -la" };
    expect(r.render(cmd)).toEqual([{ kind: "line", style: "tool", text: "… $ ls -la" }]);
    expect(r.render(cmd)).toEqual([]);
    expect(r.render({ ...cmd, status: "failed", exitCode: 2 })).toEqual([
      { kind: "line", style: "tool", text: "✗ $ ls -la (exit 2)" },
    ]);
    expect(r.render({ ...cmd, status: "failed", exitCode: 2 })).toEqual([]);
    expect(
      r.render({
        id: "f",
        status: "completed",
        type: "file_change",
        fileName: "a.ts",
        additions: 3,
        deletions: 1,
      }),
    ).toEqual([{ kind: "line", style: "tool", text: "✓ edit a.ts +3/-1" }]);
  });
  it("emits one approval prompt per pending request", () => {
    const r = new TurnItemRenderer();
    const item = {
      id: "a",
      status: "pending",
      type: "approval_request",
      requestId: "req-1",
      requestKind: "command",
      prompt: "touch x",
    };
    expect(r.render(item)).toEqual([
      { kind: "approval", requestId: "req-1", requestKind: "command", text: "touch x" },
    ]);
    expect(r.render(item)).toEqual([]);
    const resolved = new TurnItemRenderer();
    expect(resolved.render({ ...item, status: "completed" })).toEqual([]);
  });
  it("renders errors and hides reasoning", () => {
    const r = new TurnItemRenderer();
    expect(r.render({ ...base, type: "reasoning", text: "hmm" })).toEqual([]);
    expect(r.render({ ...base, type: "error", failure: { message: "usage limit" } })).toEqual([
      { kind: "line", style: "error", text: "error: usage limit" },
    ]);
  });
});

describe("time and urls", () => {
  it("reads ISO strings and decoded DateTime values", () => {
    expect(toMillis("2026-01-01T00:00:00.000Z")).toBe(Date.UTC(2026, 0, 1));
    expect(toMillis({ epochMilliseconds: 42 })).toBe(42);
    expect(toMillis(null)).toBeNull();
    const now = Date.UTC(2026, 0, 1, 1);
    expect(relativeTime({ epochMilliseconds: now - 5 * 60_000 }, now)).toBe("5m ago");
    expect(relativeTime(undefined, now)).toBe("");
  });
  it("builds a cli-surface websocket url with the ticket", () => {
    const url = new URL(
      buildSocketUrl(
        { host: "127.0.0.1", port: 3773, origin: "http://127.0.0.1:3773" },
        "tick",
        "1.2.3",
      ),
    );
    expect(url.protocol).toBe("ws:");
    expect(url.pathname).toBe("/ws");
    expect(url.searchParams.get("wsTicket")).toBe("tick");
    expect(url.searchParams.get("clientSurface")).toBe("cli");
    expect(url.searchParams.get("orchestrationProtocol")).toBe("2");
  });
});
