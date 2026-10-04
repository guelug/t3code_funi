import { describe, expect, it } from "vite-plus/test";
import {
  buildByokProviderInstance,
  parseModelSlugs,
  validateByokInput,
  OPENROUTER_BASE_URL,
} from "./byokProvider.logic";

describe("byokProvider.logic", () => {
  it("builds an OpenRouter instance with sensitive token and default models", () => {
    const inst = buildByokProviderInstance({ preset: "openrouter", apiKey: " sk-or-x " });
    expect(inst.driver).toBe("claudeAgent");
    expect(inst.environment).toEqual([
      { name: "ANTHROPIC_BASE_URL", value: OPENROUTER_BASE_URL, sensitive: false },
      { name: "ANTHROPIC_AUTH_TOKEN", value: "sk-or-x", sensitive: true },
      { name: "ANTHROPIC_API_KEY", value: "", sensitive: false },
    ]);
    const models = (inst.config as { customModels: { slug: string }[] }).customModels;
    expect(models.map((m) => m.slug)).toContain("anthropic/claude-sonnet-5.5");
  });
  it("uses custom base url and dedupes extra models", () => {
    const inst = buildByokProviderInstance({
      preset: "custom",
      apiKey: "k",
      baseUrl: "https://gw.example.com/anthropic/",
      models: "a, b\nb",
    });
    expect(inst.environment?.[0]?.value).toBe("https://gw.example.com/anthropic");
    expect((inst.config as { customModels: unknown[] }).customModels).toEqual([
      { slug: "a" },
      { slug: "b" },
    ]);
  });
  it("validates", () => {
    expect(validateByokInput({ preset: "openrouter", apiKey: "" })).toMatch(/API key/);
    expect(validateByokInput({ preset: "custom", apiKey: "k" })).toMatch(/Base URL/);
    expect(validateByokInput({ preset: "custom", apiKey: "k", baseUrl: "ftp://x" })).toMatch(
      /http/,
    );
    expect(validateByokInput({ preset: "openrouter", apiKey: "k" })).toBeNull();
    expect(parseModelSlugs(["x", " x ", ""])).toEqual(["x"]);
  });
});
