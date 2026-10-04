// Opt-in live check against the user's real `hermes acp` (FUNIBER fork).
// Run with: FUNI_HERMES_LIVE=1 vp test run src/provider/acp/HermesLive.test.ts
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import { ProviderInstanceId, AcpRegistrySettings } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { probeAcpRegistryConfiguration } from "./AcpRegistryProbe.ts";
import * as AcpRegistrySupport from "./AcpRegistrySupport.ts";

const live = process.env.FUNI_HERMES_LIVE === "1";
const decodeSettings = Schema.decodeSync(AcpRegistrySettings);

describe.skipIf(!live)("Hermes ACP live", () => {
  it.effect(
    "starts a real hermes acp session through the T3 probe",
    () =>
      Effect.gen(function* () {
        const result = yield* probeAcpRegistryConfiguration({
          instanceId: ProviderInstanceId.make("acpRegistry_hermes"),
          settings: decodeSettings({ agentId: "hermes" }),
          cwd: process.cwd(),
          environment: process.env,
        });
        yield* Effect.log("HERMES_PROBE", {
          authMethods: result.probe.authMethods.map((method) => method.id),
          modelCount: result.probe.models.length,
          currentModelId: result.probe.currentModelId,
          firstModels: result.probe.models.slice(0, 5).map((model) => model.id),
          slashCommands: result.slashCommands.slice(0, 8).map((command) => command.name),
        });
        expect(result.probe.models.length).toBeGreaterThan(0);
        expect(result.probe.authMethods.length).toBeGreaterThan(0);
      }).pipe(
        Effect.provideService(
          AcpRegistrySupport.AcpRegistryCatalog,
          AcpRegistrySupport.AcpRegistryCatalog.of({
            search: () => Effect.die("unused search"),
            prepare: () => Effect.die("unused prepare"),
            inspect: () => Effect.die("unused inspect"),
            uninstallManagedBinary: () => Effect.die("unused uninstall"),
            resolve: () =>
              Effect.succeed({
                agent: AcpRegistrySupport.withFuniberLocalAgents([])[0]!,
                distribution: "uvx",
                spawn: {
                  command: AcpRegistrySupport.localAgentCommand("hermes", ""),
                  args: ["acp"],
                  env: process.env,
                },
              }),
          }),
        ),
        Effect.provide(NodeServices.layer),
        Effect.scoped,
      ),
    120_000,
  );
});
