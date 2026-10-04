// @effect-diagnostics globalDate:off
/**
 * Pure helpers for `fcode chat`: argument parsing, model references, and
 * turning orchestration thread events into terminal text. No I/O here so it
 * stays unit-testable.
 */

export interface ChatProviderModel {
  readonly slug: string;
  readonly name: string;
  readonly subProvider?: string | undefined;
  readonly isDefault?: boolean | undefined;
}

export interface ChatProvider {
  readonly instanceId: string;
  readonly driver: string;
  readonly displayName?: string | undefined;
  readonly enabled: boolean;
  readonly installed: boolean;
  readonly status: string;
  readonly availability?: string | undefined;
  readonly models: ReadonlyArray<ChatProviderModel>;
}

export interface ModelRef {
  readonly instanceId: string;
  readonly model: string | null;
}

/** `codex/gpt-5.5`, `acpRegistry_hermes/openrouter/x`, or just `codex`. */
export function parseModelRef(input: string): ModelRef | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const slash = trimmed.indexOf("/");
  if (slash === -1) return { instanceId: trimmed, model: null };
  const instanceId = trimmed.slice(0, slash).trim();
  const model = trimmed.slice(slash + 1).trim();
  if (instanceId.length === 0) return null;
  return { instanceId, model: model.length > 0 ? model : null };
}

export function formatModelRef(ref: { readonly instanceId: string; readonly model: string }) {
  return `${ref.instanceId}/${ref.model}`;
}

export function providerLabel(provider: ChatProvider): string {
  return provider.displayName ?? provider.instanceId;
}

/** Providers a user can actually chat with, ready ones first. */
export function usableProviders(providers: ReadonlyArray<ChatProvider>): ChatProvider[] {
  return providers
    .filter((p) => p.enabled && p.installed && p.models.length > 0)
    .filter((p) => p.availability === undefined || p.availability === "available")
    .toSorted((a, b) => Number(b.status === "ready") - Number(a.status === "ready"));
}

export type ResolvedModel =
  | { readonly _tag: "resolved"; readonly instanceId: string; readonly model: string }
  | { readonly _tag: "needsModel"; readonly provider: ChatProvider }
  | { readonly _tag: "unknownProvider"; readonly instanceId: string }
  | { readonly _tag: "unknownModel"; readonly provider: ChatProvider; readonly model: string };

export function defaultModel(provider: ChatProvider): ChatProviderModel | undefined {
  return provider.models.find((m) => m.isDefault === true) ?? provider.models[0];
}

/** Match a model ref against the server's provider list (case-insensitive ids, names ok). */
export function resolveModelRef(
  providers: ReadonlyArray<ChatProvider>,
  ref: ModelRef,
): ResolvedModel {
  const needle = ref.instanceId.toLowerCase();
  const provider =
    providers.find((p) => p.instanceId.toLowerCase() === needle) ??
    providers.find((p) => (p.displayName ?? "").toLowerCase() === needle) ??
    providers.find((p) => p.driver.toLowerCase() === needle);
  if (!provider) return { _tag: "unknownProvider", instanceId: ref.instanceId };
  if (ref.model === null) return { _tag: "needsModel", provider };
  const wanted = ref.model.toLowerCase();
  const model =
    provider.models.find((m) => m.slug.toLowerCase() === wanted) ??
    provider.models.find((m) => m.name.toLowerCase() === wanted);
  if (!model) return { _tag: "unknownModel", provider, model: ref.model };
  return { _tag: "resolved", instanceId: provider.instanceId, model: model.slug };
}

/** "3" -> index 2 within [1..count]; null when not a valid pick. */
export function parsePick(input: string, count: number): number | null {
  const trimmed = input.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 1 && n <= count ? n - 1 : null;
}

/** Filter a long list by substring before numbering it (e.g. 300 Hermes models). */
export function filterByQuery<T>(
  items: ReadonlyArray<T>,
  query: string,
  text: (item: T) => string,
): T[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [...items];
  return items.filter((item) => text(item).toLowerCase().includes(q));
}

export type SlashCommand =
  | { readonly _tag: "model"; readonly arg: string | null }
  | { readonly _tag: "new" }
  | { readonly _tag: "threads" }
  | { readonly _tag: "quit" }
  | { readonly _tag: "help" }
  | { readonly _tag: "unknown"; readonly name: string };

export function parseSlashCommand(line: string): SlashCommand | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  const [rawName = "", ...rest] = trimmed.slice(1).split(/\s+/);
  const name = rawName.toLowerCase();
  const arg = rest.join(" ").trim();
  switch (name) {
    case "model":
    case "m":
      return { _tag: "model", arg: arg.length > 0 ? arg : null };
    case "new":
      return { _tag: "new" };
    case "threads":
    case "t":
      return { _tag: "threads" };
    case "quit":
    case "exit":
    case "q":
      return { _tag: "quit" };
    case "help":
    case "?":
      return { _tag: "help" };
    default:
      return { _tag: "unknown", name };
  }
}

/** `/path` style messages would be eaten as commands; `//foo` sends `/foo`. */
export function unescapeMessage(line: string): string {
  return line.trim().startsWith("//") ? line.trim().slice(1) : line;
}

export function isApprovalYes(input: string): boolean | null {
  const v = input.trim().toLowerCase();
  if (["y", "yes", "s", "si", "sí", "a", "accept"].includes(v)) return true;
  if (["n", "no", "d", "deny", "decline"].includes(v)) return false;
  return null;
}

// ---------------------------------------------------------------------------
// Rendering turn items as a stream of terminal text.

export interface ChatTurnItem {
  readonly id: string;
  readonly type: string;
  readonly runId?: string | null;
  readonly status: string;
  readonly title?: string | null;
  readonly text?: string;
  readonly streaming?: boolean;
  readonly input?: string;
  readonly output?: string;
  readonly exitCode?: number;
  readonly fileName?: string;
  readonly additions?: number;
  readonly deletions?: number;
  readonly pattern?: string;
  readonly patterns?: ReadonlyArray<string>;
  readonly message?: string;
  readonly requestId?: string;
  readonly requestKind?: string;
  readonly prompt?: string;
  readonly failure?: { readonly message?: string; readonly class?: string };
  readonly questions?: ReadonlyArray<{
    readonly id: string;
    readonly header: string;
    readonly question: string;
    readonly options: ReadonlyArray<{ readonly label: string; readonly description: string }>;
  }>;
}

export type RenderOp =
  | { readonly kind: "text"; readonly itemId: string; readonly delta: string }
  | { readonly kind: "line"; readonly style: LineStyle; readonly text: string }
  | {
      readonly kind: "approval";
      readonly requestId: string;
      readonly requestKind: string;
      readonly text: string;
    }
  | {
      readonly kind: "userInput";
      readonly requestId: string;
      readonly questions: NonNullable<ChatTurnItem["questions"]>;
    };

export type LineStyle = "tool" | "error" | "notice" | "dim";

const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled", "interrupted"]);

export function oneLine(text: string, max = 100): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Tracks what has already been printed per turn item so repeated
 * `turn-item.updated` events (full snapshots of the item) become deltas.
 */
export class TurnItemRenderer {
  private readonly printedText = new Map<string, number>();
  private readonly announced = new Set<string>();
  private readonly finished = new Set<string>();

  /** Mark items that existed before we attached so history isn't replayed. */
  seed(items: ReadonlyArray<ChatTurnItem>): void {
    for (const item of items) {
      this.printedText.set(item.id, item.text?.length ?? 0);
      this.announced.add(item.id);
      if (TERMINAL_STATUSES.has(item.status) || item.status === "completed") {
        this.finished.add(item.id);
      }
      if (item.type === "approval_request" || item.type === "user_input_request") {
        if (item.status !== "pending" && item.status !== "waiting") this.finished.add(item.id);
      }
    }
  }

  render(item: ChatTurnItem): RenderOp[] {
    switch (item.type) {
      case "assistant_message": {
        const text = item.text ?? "";
        const printed = this.printedText.get(item.id) ?? 0;
        if (text.length <= printed) return [];
        this.printedText.set(item.id, text.length);
        return [{ kind: "text", itemId: item.id, delta: text.slice(printed) }];
      }
      case "reasoning":
      case "user_message":
      case "checkpoint":
      case "todo_list":
      case "notification":
      case "compaction":
      case "handoff":
        return [];
      case "approval_request": {
        if (this.finished.has(item.id)) return [];
        if (item.status !== "pending" && item.status !== "waiting" && item.status !== "running") {
          this.finished.add(item.id);
          return [];
        }
        if (item.requestId === undefined) return [];
        this.finished.add(item.id);
        const detail = item.prompt ?? item.title ?? "";
        return [
          {
            kind: "approval",
            requestId: item.requestId,
            requestKind: item.requestKind ?? "permission",
            text: oneLine(detail, 300),
          },
        ];
      }
      case "user_input_request": {
        if (this.finished.has(item.id) || item.requestId === undefined) return [];
        if (item.status !== "pending" && item.status !== "waiting" && item.status !== "running") {
          return [];
        }
        this.finished.add(item.id);
        return [{ kind: "userInput", requestId: item.requestId, questions: item.questions ?? [] }];
      }
      case "error": {
        if (this.finished.has(item.id)) return [];
        this.finished.add(item.id);
        return [
          {
            kind: "line",
            style: "error",
            text: `error: ${item.failure?.message ?? item.title ?? "provider failure"}`,
          },
        ];
      }
      case "system_notice":
      case "run_interrupt_result": {
        if (this.finished.has(item.id)) return [];
        this.finished.add(item.id);
        return [{ kind: "line", style: "notice", text: item.message ?? item.title ?? "" }];
      }
      default:
        return this.renderTool(item);
    }
  }

  private renderTool(item: ChatTurnItem): RenderOp[] {
    const label = toolSummary(item);
    if (label === null) return [];
    const done = TERMINAL_STATUSES.has(item.status);
    if (done) {
      if (this.finished.has(item.id)) return [];
      this.finished.add(item.id);
      this.announced.add(item.id);
      const mark = item.status === "completed" ? "✓" : "✗";
      const exit =
        item.exitCode !== undefined && item.exitCode !== 0 ? ` (exit ${item.exitCode})` : "";
      return [{ kind: "line", style: "tool", text: `${mark} ${label}${exit}` }];
    }
    if (this.announced.has(item.id)) return [];
    this.announced.add(item.id);
    return [{ kind: "line", style: "tool", text: `… ${label}` }];
  }
}

export function toolSummary(item: ChatTurnItem): string | null {
  switch (item.type) {
    case "command_execution":
      return item.input && item.input.trim().length > 0
        ? `$ ${oneLine(item.input, 90)}`
        : oneLine(item.title ?? "command", 90);
    case "file_change": {
      const stats =
        item.additions !== undefined || item.deletions !== undefined
          ? ` +${item.additions ?? 0}/-${item.deletions ?? 0}`
          : "";
      return `edit ${item.fileName ?? "file"}${stats}`;
    }
    case "file_search":
      return `search ${oneLine(item.pattern ?? item.title ?? "", 80)}`;
    case "web_search":
      return `web ${oneLine((item.patterns ?? []).join(", ") || (item.title ?? ""), 80)}`;
    case "proposed_plan":
      return "plan proposed";
    default:
      return item.title ? `${item.type.replace(/_/g, " ")}: ${oneLine(item.title, 80)}` : null;
  }
}

export const ACTIVE_RUN_STATUSES = new Set([
  "preparing",
  "queued",
  "starting",
  "running",
  "waiting",
]);

/** Millis from an ISO string, Date, or decoded Effect DateTime (`epochMilliseconds`). */
export function toMillis(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  if (value instanceof Date) return value.getTime();
  const epoch = (value as { epochMilliseconds?: unknown }).epochMilliseconds;
  return typeof epoch === "number" ? epoch : null;
}

export function relativeTime(value: unknown, now = Date.now()): string {
  const t = toMillis(value);
  if (t === null) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
