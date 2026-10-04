import { describe, expect, it } from "vite-plus/test";

import {
  buildHermesProviderInstance,
  findHermesInstanceId,
  hermesInstanceIdForProfile,
  hermesProfilesFromEntries,
  nextHermesInstanceId,
} from "./hermesProvider.logic";

describe("hermes provider", () => {
  it("builds the default-profile ACP instance without HERMES_HOME", () => {
    const instance = buildHermesProviderInstance();
    expect(instance.driver).toBe("acpRegistry");
    expect(instance.config).toEqual({ agentId: "hermes" });
    expect(instance.displayName).toBe("Hermes · default");
    expect(instance.environment).toBeUndefined();
  });

  it("pins a named profile through HERMES_HOME and shows it in the name", () => {
    const instance = buildHermesProviderInstance({
      name: "funiber",
      home: "/Users/me/.hermes/profiles/funiber",
    });
    expect(instance.displayName).toBe("Hermes · funiber");
    expect(instance.environment).toEqual([
      { name: "HERMES_HOME", value: "/Users/me/.hermes/profiles/funiber", sensitive: false },
    ]);
  });

  it("derives a stable, valid instance id per profile", () => {
    expect(hermesInstanceIdForProfile("default")).toBe("acpRegistry_hermes");
    expect(hermesInstanceIdForProfile("coder-backend")).toBe("acpRegistry_hermes_coder-backend");
    expect(hermesInstanceIdForProfile("a.b c")).toBe("acpRegistry_hermes_a_b_c");
  });

  it("lists default first, then named profiles sorted, skipping hidden dirs", () => {
    const profiles = hermesProfilesFromEntries([
      { name: "writer", fullPath: "/h/profiles/writer" },
      { name: ".cache", fullPath: "/h/profiles/.cache" },
      { name: "funiber", fullPath: "/h/profiles/funiber" },
    ]);
    expect(profiles.map((profile) => profile.name)).toEqual(["default", "funiber", "writer"]);
    expect(profiles[0]?.home).toBeNull();
  });

  it("finds an existing hermes instance and ignores other agents", () => {
    expect(
      findHermesInstanceId({
        acpRegistry_devin: { driver: "acpRegistry", config: { agentId: "devin" } },
        mine: { driver: "acpRegistry", config: { agentId: "hermes" } },
      }),
    ).toBe("mine");
    expect(findHermesInstanceId({ codex: { driver: "codex" } })).toBeNull();
  });

  it("picks the next free instance id", () => {
    expect(nextHermesInstanceId({})).toBe("acpRegistry_hermes");
    expect(nextHermesInstanceId({ acpRegistry_hermes: { driver: "acpRegistry" } })).toBe(
      "acpRegistry_hermes_2",
    );
  });
});
