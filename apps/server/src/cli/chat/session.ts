// @effect-diagnostics nodeBuiltinImport:off globalDate:off
/**
 * The interactive part of `fcode chat`: a line-based terminal UI over the
 * orchestration RPCs. Threads created here are ordinary threads, so the
 * desktop app shows them (and vice versa).
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeReadline from "node:readline";
import * as NodeCrypto from "node:crypto";

import type { ChatRpc } from "./connection.ts";
import { describeCause } from "./connection.ts";
import {
  ACTIVE_RUN_STATUSES,
  type ChatProvider,
  type ChatTurnItem,
  defaultModel,
  filterByQuery,
  formatModelRef,
  isApprovalYes,
  parseModelRef,
  parsePick,
  parseSlashCommand,
  providerLabel,
  relativeTime,
  toMillis,
  type RenderOp,
  resolveModelRef,
  TurnItemRenderer,
  unescapeMessage,
  usableProviders,
} from "./logic.ts";

const M = {
  dispatch: "orchestration.dispatchCommand",
  launch: "orchestration.launchThread",
  shell: "orchestration.subscribeShell",
  thread: "orchestration.subscribeThread",
  config: "server.getConfig",
  projectsMutate: "projects.mutate",
} as const;

export type RuntimeModeChoice = "approval-required" | "auto-accept-edits" | "auto" | "full-access";

export interface ChatOptions {
  readonly projectPath: string;
  readonly modelRef: string | null;
  readonly runtimeMode: RuntimeModeChoice;
  readonly color: boolean;
}

interface Selection {
  readonly instanceId: string;
  readonly model: string;
}

interface ProjectShell {
  readonly id: string;
  readonly title: string;
  readonly workspaceRoot: string;
  readonly deletedAt?: string | null;
}

interface ThreadShell {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly modelSelection: Selection;
  readonly status: string;
  readonly latestUserMessageAt: unknown;
  readonly updatedAt?: unknown;
  readonly createdAt?: unknown;
}

const id = () => NodeCrypto.randomUUID();

export class ChatSession {
  private readonly out = process.stdout;
  private readonly rl: NodeReadline.Interface;
  private readonly lines: string[] = [];
  private lineWaiters: Array<(line: string | null) => void> = [];
  private closed = false;

  private providers: ChatProvider[] = [];
  private selection: Selection | null = null;
  private project: ProjectShell | null = null;
  private threadId: string | null = null;
  private unsubscribeThread: (() => void) | null = null;
  private renderer = new TurnItemRenderer();
  private textOpen = false;

  private activeRunId: string | null = null;
  private pendingMessageId: string | null = null;
  private turnDone: (() => void) | null = null;
  private lastSigint = 0;
  private interactionQueue: Promise<void> = Promise.resolve();

  private readonly rpc: ChatRpc;
  private readonly options: ChatOptions;

  constructor(rpc: ChatRpc, options: ChatOptions) {
    this.rpc = rpc;
    this.options = options;
    this.rl = NodeReadline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: process.stdin.isTTY === true,
    });
    this.rl.on("line", (line) => {
      const waiter = this.lineWaiters.shift();
      if (waiter) waiter(line);
      else this.lines.push(line);
    });
    this.rl.on("close", () => {
      this.closed = true;
      for (const waiter of this.lineWaiters.splice(0)) waiter(null);
    });
    this.rl.on("SIGINT", () => this.onSigint());
    // NodeRuntime.runMain interrupts the whole program on SIGINT; in chat,
    // Ctrl+C means "interrupt the turn", so this session owns the signal.
    process.removeAllListeners("SIGINT");
    process.on("SIGINT", () => this.onSigint());
  }

  // -------------------------------------------------------------------------
  // Output helpers

  private c(code: string, text: string) {
    return this.options.color ? `\x1b[${code}m${text}\x1b[0m` : text;
  }

  private closeText() {
    if (this.textOpen) {
      this.out.write("\n");
      this.textOpen = false;
    }
  }

  private print(text = "") {
    this.closeText();
    this.out.write(`${text}\n`);
  }

  private ask(question: string): Promise<string | null> {
    this.closeText();
    this.out.write(question);
    const queued = this.lines.shift();
    if (queued !== undefined) {
      if (process.stdin.isTTY !== true) this.out.write(`${queued}\n`);
      return Promise.resolve(queued);
    }
    if (this.closed) return Promise.resolve(null);
    return new Promise((resolve) =>
      this.lineWaiters.push((line) => {
        if (line !== null && process.stdin.isTTY !== true) this.out.write(`${line}\n`);
        resolve(line);
      }),
    );
  }

  private async pick<T>(
    title: string,
    items: ReadonlyArray<T>,
    label: (item: T) => string,
    options: { readonly defaultIndex?: number; readonly searchable?: boolean } = {},
  ): Promise<T | null> {
    let shown = [...items];
    for (;;) {
      this.print(this.c("1", title));
      const limit = 30;
      shown.slice(0, limit).forEach((item, index) => {
        const marker = index === options.defaultIndex && shown.length === items.length ? "*" : " ";
        this.print(`${marker}${String(index + 1).padStart(3)}. ${label(item)}`);
      });
      if (shown.length > limit) {
        this.print(this.c("2", `   … ${shown.length - limit} more; type text to filter`));
      }
      const hint =
        options.defaultIndex !== undefined && shown.length === items.length
          ? ` [${options.defaultIndex + 1}]`
          : "";
      const answer = await this.ask(`number${options.searchable ? " or filter" : ""}${hint}> `);
      if (answer === null || /^\/(q|quit|exit|cancel)$/i.test(answer.trim())) return null;
      if (answer.trim() === "" && options.defaultIndex !== undefined) {
        return items[options.defaultIndex] ?? null;
      }
      const index = parsePick(answer, Math.min(shown.length, limit));
      if (index !== null) return shown[index] ?? null;
      if (options.searchable && answer.trim() !== "") {
        const filtered = filterByQuery(items, answer, label);
        if (filtered.length === 0) this.print(this.c("33", "no matches"));
        else shown = filtered;
        if (filtered.length === 1) return filtered[0]!;
        continue;
      }
      this.print(this.c("33", "pick a number from the list"));
    }
  }

  // -------------------------------------------------------------------------
  // Server state

  private async loadProviders() {
    const config = await this.rpc.call<{ providers: ChatProvider[] }>(M.config, {});
    this.providers = usableProviders(config.providers);
  }

  private shellSnapshot(): Promise<{ projects: ProjectShell[]; threads: ThreadShell[] }> {
    return new Promise((resolve, reject) => {
      let done = false;
      const stop = this.rpc.subscribe(
        M.shell,
        {},
        (item: {
          kind: string;
          snapshot?: { projects: ProjectShell[]; threads: ThreadShell[] };
        }) => {
          if (done || item.kind !== "snapshot" || !item.snapshot) return;
          done = true;
          resolve(item.snapshot);
          queueMicrotask(() => stop());
        },
        (error) => {
          if (!done) reject(new Error(`subscribeShell ended: ${describeCause(error)}`));
        },
      );
    });
  }

  private async resolveProject() {
    const wanted = (() => {
      try {
        return NodeFS.realpathSync(NodePath.resolve(this.options.projectPath));
      } catch {
        return NodePath.resolve(this.options.projectPath);
      }
    })();
    const snapshot = await this.shellSnapshot();
    const active = snapshot.projects.filter((p) => !p.deletedAt);
    const match = active.find((p) => p.workspaceRoot === wanted);
    if (match) {
      this.project = match;
      return;
    }
    if (!NodeFS.existsSync(wanted)) {
      throw new Error(`Project path does not exist: ${wanted}`);
    }
    const title = NodePath.basename(wanted) || "project";
    const created = await this.rpc.call<ProjectShell>(M.projectsMutate, {
      type: "project.create",
      commandId: id(),
      projectId: id(),
      title,
      workspaceRoot: wanted,
    });
    this.project = created;
    this.print(this.c("2", `Added project ${created.title} (${created.workspaceRoot})`));
  }

  private async chooseModel(initial: string | null): Promise<boolean> {
    if (this.providers.length === 0) {
      this.print(
        this.c("31", "No usable providers. Set one up in Funi Code > Settings > Providers."),
      );
      return false;
    }
    let provider: ChatProvider | null = null;
    if (initial) {
      const ref = parseModelRef(initial);
      const resolved = ref ? resolveModelRef(this.providers, ref) : null;
      if (resolved?._tag === "resolved") {
        this.selection = { instanceId: resolved.instanceId, model: resolved.model };
        return true;
      }
      if (resolved?._tag === "needsModel" || resolved?._tag === "unknownModel") {
        provider = resolved.provider;
        if (resolved._tag === "unknownModel") {
          this.print(
            this.c("33", `Model '${resolved.model}' not offered by ${providerLabel(provider)}.`),
          );
        }
      } else {
        this.print(this.c("33", `Unknown provider '${initial}'.`));
      }
    }
    if (!provider) {
      const currentIndex = this.selection
        ? this.providers.findIndex((p) => p.instanceId === this.selection!.instanceId)
        : 0;
      provider = await this.pick(
        "Provider:",
        this.providers,
        (p) =>
          `${providerLabel(p)} ${this.c("2", `(${p.instanceId}, ${p.models.length} models${p.status === "ready" ? "" : `, ${p.status}`})`)}`,
        { defaultIndex: currentIndex >= 0 ? currentIndex : 0, searchable: true },
      );
      if (!provider) return false;
    }
    const fallback = defaultModel(provider);
    const currentModelIndex = provider.models.findIndex(
      (m) =>
        m.slug ===
        (this.selection?.instanceId === provider!.instanceId
          ? this.selection.model
          : fallback?.slug),
    );
    const model =
      provider.models.length === 1
        ? provider.models[0]!
        : await this.pick(
            `Model for ${providerLabel(provider)}:`,
            provider.models,
            (m) =>
              `${m.name}${m.subProvider ? this.c("2", ` · ${m.subProvider}`) : ""}${m.name === m.slug ? "" : this.c("2", ` (${m.slug})`)}`,
            { defaultIndex: Math.max(0, currentModelIndex), searchable: true },
          );
    if (!model) return false;
    this.selection = { instanceId: provider.instanceId, model: model.slug };
    return true;
  }

  private selectionLabel() {
    if (!this.selection) return "no model";
    const provider = this.providers.find((p) => p.instanceId === this.selection!.instanceId);
    const model = provider?.models.find((m) => m.slug === this.selection!.model);
    return `${provider ? providerLabel(provider) : this.selection.instanceId} · ${model?.name ?? this.selection.model}`;
  }

  // -------------------------------------------------------------------------
  // Thread streaming

  private attachThread(
    threadId: string,
    options: { readonly showHistory: boolean; readonly liveRunId?: string | null },
  ) {
    this.unsubscribeThread?.();
    this.threadId = threadId;
    this.renderer = new TurnItemRenderer();
    let seeded = false;
    return new Promise<void>((resolve, reject) => {
      this.unsubscribeThread = this.rpc.subscribe(
        M.thread,
        { threadId },
        (item: any) => {
          if (item.kind === "snapshot") {
            const projection = item.projection;
            if (!seeded) {
              seeded = true;
              if (options.showHistory) this.printHistory(projection);
              const items = projection.turnItems as ChatTurnItem[];
              // History is marked as printed; the run we just started is rendered
              // so text that streamed before the subscription is not lost.
              this.renderer.seed(
                items.filter((t) => options.liveRunId == null || t.runId !== options.liveRunId),
              );
              const active = (projection.runs as any[]).findLast((run) =>
                ACTIVE_RUN_STATUSES.has(run.status),
              );
              if (active && this.pendingMessageId === null) this.activeRunId = active.id;
              for (const turnItem of items) {
                if (options.liveRunId != null && turnItem.runId === options.liveRunId) {
                  this.apply(this.renderer.render(turnItem));
                }
              }
              const live = (projection.runs as any[]).find((r) => r.id === options.liveRunId);
              if (live && !ACTIVE_RUN_STATUSES.has(live.status))
                this.onEvent({ type: "run.updated", payload: live });
              resolve();
            }
            return;
          }
          if (item.kind !== "event") return;
          this.onEvent(item.event);
        },
        (error) => {
          if (!seeded) reject(new Error(`subscribeThread ended: ${describeCause(error)}`));
          else if (error) this.print(this.c("31", `thread stream ended: ${describeCause(error)}`));
        },
      );
    });
  }

  private printHistory(projection: any) {
    const messages = (projection.messages as any[])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-6);
    if (messages.length === 0) return;
    this.print(this.c("2", "— recent messages —"));
    for (const message of messages) {
      const who = message.role === "user" ? this.c("36", "you") : this.c("35", "assistant");
      const text = String(message.text);
      this.print(`${who}: ${text.length > 600 ? `${text.slice(0, 600)}…` : text}`);
    }
    this.print(this.c("2", "—"));
  }

  private onEvent(event: any) {
    switch (event.type) {
      case "turn-item.updated":
        this.apply(this.renderer.render(event.payload as ChatTurnItem));
        return;
      case "run.created":
      case "run.updated": {
        const run = event.payload;
        if (this.pendingMessageId !== null && run.userMessageId === this.pendingMessageId) {
          this.activeRunId = run.id;
        }
        if (run.id === this.activeRunId && !ACTIVE_RUN_STATUSES.has(run.status)) {
          this.closeText();
          if (run.status !== "completed") this.print(this.c("33", `[run ${run.status}]`));
          this.activeRunId = null;
          this.pendingMessageId = null;
          const done = this.turnDone;
          this.turnDone = null;
          done?.();
        }
        return;
      }
      default:
        return;
    }
  }

  private apply(ops: ReadonlyArray<RenderOp>) {
    for (const op of ops) {
      switch (op.kind) {
        case "text":
          if (!this.textOpen) {
            this.out.write(this.c("35", "● "));
            this.textOpen = true;
          }
          this.out.write(op.delta);
          break;
        case "line": {
          const color = { tool: "2", error: "31", notice: "33", dim: "2" }[op.style];
          this.print(this.c(color, `  ${op.text}`));
          break;
        }
        case "approval":
          this.enqueueInteraction(() => this.handleApproval(op));
          break;
        case "userInput":
          this.enqueueInteraction(() => this.handleUserInput(op));
          break;
      }
    }
  }

  private enqueueInteraction(task: () => Promise<void>) {
    this.interactionQueue = this.interactionQueue.then(task).catch((error) => {
      this.print(this.c("31", `request failed: ${describeCause(error)}`));
    });
  }

  private async respond(requestId: string, payload: Record<string, unknown>) {
    await this.rpc.call(M.dispatch, {
      type: "runtime-request.respond",
      commandId: id(),
      threadId: this.threadId,
      requestId,
      ...payload,
    });
  }

  private async handleApproval(op: Extract<RenderOp, { kind: "approval" }>) {
    this.print(this.c("33;1", `⚠ approval needed (${op.requestKind})`));
    if (op.text) this.print(this.c("33", `  ${op.text}`));
    for (;;) {
      const answer = await this.ask(this.c("33", "allow? [y/n/a=always for session] "));
      if (answer === null) {
        await this.respond(op.requestId, { decision: "cancel" });
        return;
      }
      if (answer.trim().toLowerCase() === "a") {
        await this.respond(op.requestId, { decision: "acceptForSession" });
        return;
      }
      const yes = isApprovalYes(answer);
      if (yes === null) continue;
      await this.respond(op.requestId, { decision: yes ? "accept" : "decline" });
      this.print(this.c("2", yes ? "  approved" : "  denied"));
      return;
    }
  }

  private async handleUserInput(op: Extract<RenderOp, { kind: "userInput" }>) {
    const answers: Record<string, string> = {};
    for (const question of op.questions) {
      this.print(this.c("36;1", `? ${question.header}: ${question.question}`));
      question.options.forEach((option, index) =>
        this.print(`  ${index + 1}. ${option.label} ${this.c("2", option.description)}`),
      );
      const answer = await this.ask("answer (number or text)> ");
      if (answer === null) return;
      const index = parsePick(answer, question.options.length);
      answers[question.id] = index !== null ? question.options[index]!.label : answer.trim();
    }
    await this.respond(op.requestId, { answers });
  }

  // -------------------------------------------------------------------------
  // Turns

  private async sendMessage(text: string) {
    if (!this.selection || !this.project) return;
    const messageId = id();
    this.pendingMessageId = messageId;
    const finished = new Promise<void>((resolve) => (this.turnDone = resolve));
    try {
      if (this.threadId === null) {
        const threadId = id();
        const title = text.trim().replace(/\s+/g, " ").slice(0, 60) || "New thread";
        await this.attachThreadAfterLaunch(threadId, () =>
          this.rpc.call(M.launch, {
            commandId: id(),
            creationSource: "server",
            threadId,
            projectId: this.project!.id,
            title,
            generateTitle: true,
            modelSelection: this.selection,
            runtimeMode: this.options.runtimeMode,
            interactionMode: "default",
            workspaceStrategy: { type: "root" },
            initialMessage: { messageId, text, attachments: [] },
          }),
        );
      } else {
        await this.rpc.call(M.dispatch, {
          type: "message.dispatch",
          commandId: id(),
          createdBy: "user",
          creationSource: "server",
          threadId: this.threadId,
          messageId,
          text,
          attachments: [],
          modelSelection: this.selection,
          deliveryIntent: "auto",
          dispatchMode: { type: "start_immediately" },
        });
      }
    } catch (error) {
      this.pendingMessageId = null;
      this.turnDone = null;
      this.print(this.c("31", `send failed: ${describeCause(error)}`));
      return;
    }
    await finished;
    await this.interactionQueue;
  }

  /** Launch, then subscribe from the launch projection so no early events are missed. */
  private async attachThreadAfterLaunch(threadId: string, launch: () => Promise<any>) {
    const result = await launch();
    const projection = result.projection;
    const run = (projection.runs as any[]).find((r) => r.userMessageId === this.pendingMessageId);
    if (run) this.activeRunId = run.id;
    await this.attachThread(result.threadId ?? threadId, {
      showHistory: false,
      liveRunId: run?.id ?? null,
    });
  }

  private async interrupt() {
    if (!this.threadId || !this.activeRunId) return false;
    await this.rpc.call(M.dispatch, {
      type: "run.interrupt",
      commandId: id(),
      threadId: this.threadId,
      runId: this.activeRunId,
      holdQueue: true,
    });
    return true;
  }

  private onSigint() {
    const now = Date.now();
    if (this.turnDone !== null) {
      this.closeText();
      this.print(this.c("33", "^C interrupting… (press again to quit)"));
      void this.interrupt().catch((error) =>
        this.print(this.c("31", `interrupt failed: ${describeCause(error)}`)),
      );
      if (now - this.lastSigint < 1500) this.exit(130);
      this.lastSigint = now;
      return;
    }
    if (now - this.lastSigint < 1500) this.exit(0);
    this.lastSigint = now;
    this.print(this.c("2", "(press Ctrl+C again or /quit to exit)"));
    this.out.write(this.prompt());
  }

  private exit(code: number) {
    this.unsubscribeThread?.();
    this.rl.close();
    process.exit(code);
  }

  // -------------------------------------------------------------------------
  // Commands

  private async listThreads() {
    const snapshot = await this.shellSnapshot();
    const threads = snapshot.threads
      .filter((t) => t.projectId === this.project!.id)
      .toSorted(
        (a, b) =>
          (toMillis(b.latestUserMessageAt ?? b.updatedAt) ?? 0) -
          (toMillis(a.latestUserMessageAt ?? a.updatedAt) ?? 0),
      )
      .slice(0, 20);
    if (threads.length === 0) {
      this.print("No threads in this project yet.");
      return;
    }
    const chosen = await this.pick(
      `Threads in ${this.project!.title}:`,
      threads,
      (t) =>
        `${t.title} ${this.c("2", `${t.modelSelection.instanceId}/${t.modelSelection.model} · ${t.status} · ${relativeTime(t.latestUserMessageAt ?? t.updatedAt)}`)}`,
      { searchable: true },
    );
    if (!chosen) return;
    this.selection = {
      instanceId: chosen.modelSelection.instanceId,
      model: chosen.modelSelection.model,
    };
    await this.attachThread(chosen.id, { showHistory: true });
    this.print(this.c("2", `Resumed "${chosen.title}" (${this.selectionLabel()})`));
  }

  private prompt() {
    return this.c("36", "you› ");
  }

  private help() {
    this.print(
      this.c(
        "2",
        "/model [instance/slug]  switch model · /new  new thread · /threads  resume a thread · /quit\n" +
          "Ctrl+C interrupts a running turn; twice exits. Start a message with // to send a literal /.",
      ),
    );
  }

  async run(): Promise<number> {
    await this.loadProviders();
    await this.resolveProject();
    if (!(await this.chooseModel(this.options.modelRef))) return 1;
    this.print(
      `${this.c("1", "Funi Code chat")} ${this.c("2", `· ${this.project!.title} · ${this.selectionLabel()} · ${this.options.runtimeMode}`)}`,
    );
    this.help();

    for (;;) {
      const line = await this.ask(this.prompt());
      if (line === null) break;
      if (line.trim() === "") continue;
      const command = parseSlashCommand(line);
      if (command) {
        try {
          if (command._tag === "quit") break;
          if (command._tag === "help") this.help();
          if (command._tag === "new") {
            this.unsubscribeThread?.();
            this.unsubscribeThread = null;
            this.threadId = null;
            this.print(this.c("2", "New thread (created on your next message)."));
          }
          if (command._tag === "model") {
            await this.loadProviders();
            if (await this.chooseModel(command.arg)) {
              this.print(
                this.c("2", `Model: ${this.selectionLabel()} (${formatModelRef(this.selection!)})`),
              );
            }
          }
          if (command._tag === "threads") await this.listThreads();
          if (command._tag === "unknown")
            this.print(this.c("33", `Unknown command /${command.name}`));
        } catch (error) {
          this.print(this.c("31", describeCause(error)));
        }
        continue;
      }
      await this.sendMessage(unescapeMessage(line));
    }
    this.unsubscribeThread?.();
    this.rl.close();
    return 0;
  }
}
