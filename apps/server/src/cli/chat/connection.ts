// @effect-diagnostics nodeBuiltinImport:off globalFetch:off globalErrorInEffectFailure:off anyUnknownInErrorContext:off
/**
 * Connection plumbing for `fcode chat`: find the running server, keep a cached
 * bearer session (0600 file in the state dir), trade it for a WebSocket ticket
 * and open the same typed RPC client the web and mobile apps use.
 */
import * as NodeSocket from "@effect/platform-node/NodeSocket";
import { AuthAdministrativeScopes, WsRpcGroup } from "@t3tools/contracts";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import type * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import * as RpcClient from "effect/unstable/rpc/RpcClient";
import * as RpcSerialization from "effect/unstable/rpc/RpcSerialization";
import * as Socket from "effect/unstable/socket/Socket";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type * as EnvironmentAuth from "../../auth/EnvironmentAuth.ts";

export const CHAT_SESSION_FILE = "cli-chat-session.json";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface ServerTarget {
  readonly host: string;
  readonly port: number;
  readonly origin: string;
}

export interface CachedChatSession {
  readonly sessionId: string;
  readonly token: string;
}

export function readServerTarget(serverRuntimeStatePath: string): ServerTarget | null {
  try {
    const raw = JSON.parse(NodeFS.readFileSync(serverRuntimeStatePath, "utf8")) as Record<
      string,
      unknown
    >;
    if (typeof raw.port !== "number") return null;
    const host = typeof raw.host === "string" && raw.host.length > 0 ? raw.host : "127.0.0.1";
    const origin = typeof raw.origin === "string" ? raw.origin : `http://${host}:${raw.port}`;
    return { host, port: raw.port, origin };
  } catch {
    return null;
  }
}

export function readCachedSession(file: string): CachedChatSession | null {
  try {
    const raw = JSON.parse(NodeFS.readFileSync(file, "utf8")) as Record<string, unknown>;
    if (typeof raw.token === "string" && typeof raw.sessionId === "string") {
      return { token: raw.token, sessionId: raw.sessionId };
    }
  } catch {
    // missing or corrupt: re-issue
  }
  return null;
}

export function writeCachedSession(file: string, session: CachedChatSession): void {
  NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
  NodeFS.writeFileSync(file, `${JSON.stringify(session)}\n`, { mode: 0o600 });
  NodeFS.chmodSync(file, 0o600);
}

async function sessionIsValid(target: ServerTarget, token: string): Promise<boolean | null> {
  try {
    const res = await fetch(`${target.origin}/api/auth/session`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { authenticated?: boolean };
    return body.authenticated === true;
  } catch {
    return null; // server unreachable
  }
}

export class ChatConnectError extends Error {}

/** Reuse the cached bearer session, or issue (and cache) a new one in-process. */
export const ensureChatSession = Effect.fn("fcodeChat.ensureSession")(function* (input: {
  readonly environmentAuth: EnvironmentAuth.EnvironmentAuth["Service"];
  readonly target: ServerTarget;
  readonly sessionFile: string;
  readonly label: string;
}) {
  const cached = readCachedSession(input.sessionFile);
  if (cached) {
    const valid = yield* Effect.promise(() => sessionIsValid(input.target, cached.token));
    if (valid === null) {
      return yield* Effect.fail(
        new ChatConnectError(`Funi Code server at ${input.target.origin} is not answering.`),
      );
    }
    if (valid) return cached;
  }
  const issued = yield* input.environmentAuth.issueSession({
    scopes: AuthAdministrativeScopes,
    ttl: Duration.millis(SESSION_TTL_MS),
    label: input.label,
  });
  const session = { sessionId: String(issued.sessionId), token: issued.token };
  writeCachedSession(input.sessionFile, session);
  const valid = yield* Effect.promise(() => sessionIsValid(input.target, session.token));
  if (valid !== true) {
    return yield* Effect.fail(
      new ChatConnectError(
        valid === null
          ? `Funi Code server at ${input.target.origin} is not answering.`
          : "The running server rejected a freshly issued session (is it using another --base-dir?).",
      ),
    );
  }
  return session;
});

async function fetchWebSocketTicket(target: ServerTarget, token: string): Promise<string> {
  const res = await fetch(`${target.origin}/api/auth/websocket-ticket`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new ChatConnectError(`websocket-ticket failed: HTTP ${res.status}`);
  const body = (await res.json()) as { ticket?: string };
  if (!body.ticket) throw new ChatConnectError("websocket-ticket: empty response");
  return body.ticket;
}

export function buildSocketUrl(target: ServerTarget, ticket: string, appVersion: string): string {
  const url = new URL(target.origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws";
  url.searchParams.set("wsTicket", ticket);
  url.searchParams.set("clientSurface", "cli");
  url.searchParams.set("clientAppVersion", appVersion);
  url.searchParams.set("connectionMethod", "direct");
  url.searchParams.set("orchestrationProtocol", "2");
  return url.toString();
}

/**
 * Promise-shaped view of the typed RPC client, so the readline UI can stay
 * plain async code. Inputs/outputs are still the contract types on the wire.
 */
export interface ChatRpc {
  call<A = any>(method: string, input: unknown): Promise<A>;
  subscribe<A = any>(
    method: string,
    input: unknown,
    onItem: (item: A) => void,
    onEnd?: (error: unknown) => void,
  ): () => void;
}

const makeProtocolClient = RpcClient.make(WsRpcGroup);

export const openChatRpc = Effect.fn("fcodeChat.openRpc")(function* (input: {
  readonly target: ServerTarget;
  readonly token: string;
  readonly appVersion: string;
}): Effect.fn.Return<ChatRpc, unknown, Scope.Scope> {
  const ticket = yield* Effect.tryPromise(() => fetchWebSocketTicket(input.target, input.token));
  const socketUrl = buildSocketUrl(input.target, ticket, input.appVersion);
  const protocolLayer = Layer.effect(
    RpcClient.Protocol,
    RpcClient.makeProtocolSocket({ retryTransientErrors: false, retryPolicy: Schedule.recurs(0) }),
  ).pipe(
    Layer.provide(
      Layer.mergeAll(
        Socket.layerWebSocket(socketUrl, { openTimeout: "15 seconds" }).pipe(
          Layer.provide(NodeSocket.layerWebSocketConstructor),
        ),
        RpcSerialization.layerJson,
      ),
    ),
  );
  const context = yield* Layer.build(protocolLayer);
  const client = (yield* makeProtocolClient.pipe(Effect.provide(context))) as unknown as Record<
    string,
    (input: unknown) => any
  >;

  const method = (name: string) => {
    const fn = client[name];
    if (typeof fn !== "function") throw new Error(`Unknown RPC method ${name}`);
    return fn;
  };

  return {
    call: (name, payload) =>
      Effect.runPromiseExit(method(name)(payload) as Effect.Effect<any, unknown>).then((exit) => {
        if (Exit.isSuccess(exit)) return exit.value;
        throw new ChatRpcError(name, exit.cause);
      }),
    subscribe: (name, payload, onItem, onEnd) => {
      const stream = method(name)(payload) as Stream.Stream<any, unknown>;
      const fiber = Effect.runFork(
        Stream.runForEach(stream, (item) => Effect.sync(() => onItem(item))),
      );
      let cancelled = false;
      fiber.addObserver((exit) => {
        if (!onEnd || cancelled) return;
        onEnd(Exit.isSuccess(exit) ? null : exit.cause);
      });
      return () => {
        cancelled = true;
        Effect.runFork(Fiber.interrupt(fiber));
      };
    },
  };
});

export class ChatRpcError extends Error {
  readonly method: string;
  override readonly cause: unknown;
  constructor(method: string, cause: unknown) {
    super(`${method} failed: ${describeCause(cause)}`);
    this.method = method;
    this.cause = cause;
  }
}

export function describeCause(cause: unknown): string {
  const text = String((cause as { message?: string })?.message ?? cause);
  const failure = /"message":"([^"]+)"/.exec(JSON.stringify(cause ?? null) ?? "");
  return failure?.[1] ?? text.split("\n")[0] ?? "unknown error";
}
