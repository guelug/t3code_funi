import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderInstanceConfig,
} from "@t3tools/contracts";

/** Registry id the FUNIBER server injects for the local `hermes acp` agent. */
export const HERMES_AGENT_ID = "hermes";
export const HERMES_INSTANCE_ID = "acpRegistry_hermes";

type InstanceMap = Readonly<
  Record<string, { readonly driver: string; readonly config?: unknown } | undefined>
>;

/** Existing Hermes instance id, so the button selects it instead of duplicating. */
export function findHermesInstanceId(instances: InstanceMap): string | null {
  for (const [id, instance] of Object.entries(instances)) {
    if (!instance || instance.driver !== "acpRegistry") continue;
    const config = instance.config;
    if (config && typeof config === "object" && "agentId" in config) {
      if ((config as { agentId?: unknown }).agentId === HERMES_AGENT_ID) return id;
    }
  }
  return null;
}

/** Next free instance id (`acpRegistry_hermes`, `_2`, ...). */
export function nextHermesInstanceId(instances: InstanceMap): ProviderInstanceId {
  let id = HERMES_INSTANCE_ID;
  for (let n = 2; id in instances; n += 1) id = `${HERMES_INSTANCE_ID}_${n}`;
  return ProviderInstanceId.make(id);
}

/** Provider instance that runs the user's own `hermes` executable over ACP. */
export function buildHermesProviderInstance(): ProviderInstanceConfig {
  return {
    driver: ProviderDriverKind.make("acpRegistry"),
    enabled: true,
    displayName: "Hermes",
    config: { agentId: HERMES_AGENT_ID },
  };
}
