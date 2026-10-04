// @effect-diagnostics nodeBuiltinImport:off anyUnknownInErrorContext:off
/**
 * `fcode chat` - a basic terminal chat client for the running Funi Code server.
 *
 * Connects to the server the desktop app (or `fcode serve`) already runs, so
 * providers, projects and threads are the same ones the app shows. Auth uses a
 * cached bearer session (state dir, 0600) issued in-process like
 * `fcode auth session issue`.
 */
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as References from "effect/References";
import { Command, Flag, GlobalFlag } from "effect/unstable/cli";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import packageJson from "../../package.json" with { type: "json" };
import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import * as ServerConfig from "../config.ts";
import { authLocationFlags, resolveCliAuthConfig } from "./config.ts";
import {
  CHAT_SESSION_FILE,
  describeCause,
  ensureChatSession,
  openChatRpc,
  readServerTarget,
} from "./chat/connection.ts";
import { ChatSession, type RuntimeModeChoice } from "./chat/session.ts";

const RUNTIME_MODES = ["approval-required", "auto-accept-edits", "auto", "full-access"] as const;

export const chatCommand = Command.make("chat", {
  ...authLocationFlags,
  project: Flag.String("project").pipe(
    Flag.withDescription("Project directory (default: current directory; added if missing)."),
    Flag.optional,
  ),
  model: Flag.String("model").pipe(
    Flag.withDescription(
      "Provider instance and model, e.g. `codex/gpt-5.5` or `acpRegistry_hermes`.",
    ),
    Flag.optional,
  ),
  mode: Flag.Literals("mode", RUNTIME_MODES).pipe(
    Flag.withDescription("Runtime mode for new threads (default: approval-required)."),
    Flag.withDefault("approval-required" as RuntimeModeChoice),
  ),
  noColor: Flag.Boolean("no-color").pipe(
    Flag.withDescription("Disable ANSI colors."),
    Flag.withDefault(false),
  ),
}).pipe(
  Command.withDescription("Chat with your agents from the terminal, sharing threads with the app."),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      const logLevel = yield* GlobalFlag.LogLevel;
      const config = yield* resolveCliAuthConfig(flags, logLevel);
      const target = readServerTarget(config.serverRuntimeStatePath);
      if (!target) {
        yield* Console.error(
          "Funi Code is not running. Open the app (or run `fcode serve`) and try again.",
        );
        return yield* Effect.sync(() => process.exit(1));
      }
      const session = yield* Effect.gen(function* () {
        const environmentAuth = yield* EnvironmentAuth.EnvironmentAuth;
        return yield* ensureChatSession({
          environmentAuth,
          target,
          sessionFile: NodePath.join(config.stateDir, CHAT_SESSION_FILE),
          label: `fcode chat (${NodeOS.hostname()})`,
        });
      }).pipe(
        Effect.provide(
          EnvironmentAuth.runtimeLayer.pipe(
            Layer.provide(ServerConfig.layer(config)),
            Layer.provide(Layer.succeed(References.MinimumLogLevel, "Error")),
          ),
        ),
      );
      const rpc = yield* openChatRpc({
        target,
        token: session.token,
        appVersion: packageJson.version,
      });
      const chat = new ChatSession(rpc, {
        projectPath: Option.getOrElse(flags.project, () => process.cwd()),
        modelRef: Option.getOrNull(flags.model),
        runtimeMode: flags.mode,
        color: !flags.noColor && process.stdout.isTTY === true && !process.env.NO_COLOR,
      });
      const code = yield* Effect.promise(() =>
        chat.run().catch((error: unknown) => {
          process.stderr.write(`fcode chat: ${describeCause(error)}\n`);
          return 1;
        }),
      );
      return yield* Effect.sync(() => process.exit(code));
    }).pipe(
      Effect.catch((error) =>
        Console.error(`fcode chat: ${describeCause(error)}`).pipe(
          Effect.andThen(Effect.sync(() => process.exit(1))),
        ),
      ),
    ),
  ),
);
