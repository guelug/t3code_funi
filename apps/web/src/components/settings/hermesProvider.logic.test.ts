import { describe, expect, it } from "vite-plus/test";

import {
  buildHermesProviderInstance,
  findHermesInstanceId,
  nextHermesInstanceId,
} from "./hermesProvider.logic";

describe("hermes provider", () => {
  it("builds an ACP instance for the local hermes agent", () => {
    const instance = buildHermesProviderInstance();
    expect(instance.driver).toBe("acpRegistry");
    expect(instance.config).toEqual({ agentId: "hermes" });
    expect(instance.displayName).toBe("Hermes");
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
