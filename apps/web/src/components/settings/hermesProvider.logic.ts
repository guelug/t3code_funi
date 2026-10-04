import {
  ProviderDriverKind,
  ProviderInstanceId,
  type ProviderInstanceConfig,
} from "@t3tools/contracts";

/** Registry id the FUNIBER server injects for the local `hermes acp` agent. */
export const HERMES_AGENT_ID = "hermes";
export const HERMES_INSTANCE_ID = "acpRegistry_hermes";
export const HERMES_DEFAULT_PROFILE = "default";

/** A Hermes profile: `default` is the root `~/.hermes`, others live in `~/.hermes/profiles/<name>`. */
export interface HermesProfile {
  readonly name: string;
  /** Absolute HERMES_HOME for named profiles; null for the root/default profile. */
  readonly home: string | null;
}

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

/** Deterministic instance id per profile (`acpRegistry_hermes`, `acpRegistry_hermes_funiber`). */
export function hermesInstanceIdForProfile(profileName: string): ProviderInstanceId {
  if (profileName === HERMES_DEFAULT_PROFILE) return ProviderInstanceId.make(HERMES_INSTANCE_ID);
  const slug = profileName.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
  return ProviderInstanceId.make(`${HERMES_INSTANCE_ID}_${slug}`);
}

/** Provider instance that runs the user's own `hermes` executable over ACP for one profile. */
export function buildHermesProviderInstance(
  profile: HermesProfile = { name: HERMES_DEFAULT_PROFILE, home: null },
): ProviderInstanceConfig {
  return {
    driver: ProviderDriverKind.make("acpRegistry"),
    enabled: true,
    displayName: `Hermes · ${profile.name}`,
    ...(profile.home === null
      ? {}
      : { environment: [{ name: "HERMES_HOME", value: profile.home, sensitive: false }] }),
    config: { agentId: HERMES_AGENT_ID },
  };
}

/** Profiles from a `~/.hermes/profiles/` directory listing, default first. */
export function hermesProfilesFromEntries(
  entries: ReadonlyArray<{ readonly name: string; readonly fullPath: string }>,
): HermesProfile[] {
  const named = entries
    .filter((entry) => !entry.name.startsWith("."))
    .map((entry) => ({ name: entry.name, home: entry.fullPath }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return [{ name: HERMES_DEFAULT_PROFILE, home: null }, ...named];
}
