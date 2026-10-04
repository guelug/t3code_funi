import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  isCustomSystemId,
  sanitizeCustomSystems,
  slugifyName,
  useCustomDesignSystemsStore,
} from "./customDesignSystemsStore";

beforeEach(() => useCustomDesignSystemsStore.setState({ systems: [] }));

describe("customDesignSystemsStore", () => {
  it("adds with a custom: id and replaces same-name entries", () => {
    const a = useCustomDesignSystemsStore.getState().add("My Brand!", "# one");
    expect(a.id).toBe("custom:my-brand");
    expect(isCustomSystemId(a.id)).toBe(true);
    useCustomDesignSystemsStore.getState().add("My Brand!", "# two");
    expect(useCustomDesignSystemsStore.getState().systems).toEqual([
      { id: "custom:my-brand", name: "My Brand!", markdown: "# two" },
    ]);
  });
  it("removes by id", () => {
    const a = useCustomDesignSystemsStore.getState().add("A", "x");
    useCustomDesignSystemsStore.getState().remove(a.id);
    expect(useCustomDesignSystemsStore.getState().systems).toEqual([]);
  });
  it("sanitizes corrupt persisted data", () => {
    expect(
      sanitizeCustomSystems([
        { id: "custom:a", name: "A", markdown: "m" },
        { id: "x" },
        null,
        { id: "funiber", name: "n", markdown: "m" },
      ]),
    ).toEqual([{ id: "custom:a", name: "A", markdown: "m" }]);
    expect(sanitizeCustomSystems("nope")).toEqual([]);
  });
  it("slugifies", () => expect(slugifyName("  ¡¡ ")).toBe("system"));
});
