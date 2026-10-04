import { ProviderDriverKind, type ProviderInstanceConfig } from "@t3tools/contracts";

/**
 * One-click BYOK setup. The Claude driver spawns the Claude CLI with the
 * instance `environment` merged into its process env, so an Anthropic-compatible
 * gateway is configured with ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN, and
 * ANTHROPIC_API_KEY explicitly emptied so an ambient key is never sent instead.
 */
export const OPENROUTER_BASE_URL = "https://openrouter.ai/api";

export const OPENROUTER_DEFAULT_MODELS: ReadonlyArray<{ slug: string; name: string }> = [
  { slug: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
  { slug: "anthropic/claude-opus-4.1", name: "Claude Opus 4.1" },
  { slug: "openai/gpt-5", name: "GPT-5" },
  { slug: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro" },
  { slug: "deepseek/deepseek-chat-v3.1", name: "DeepSeek V3.1" },
  { slug: "qwen/qwen3-coder", name: "Qwen3 Coder" },
  { slug: "moonshotai/kimi-k2", name: "Kimi K2" },
];

export type ByokPreset = "openrouter" | "custom";

export interface ByokProviderInput {
  readonly preset: ByokPreset;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly label?: string;
  /** Extra model slugs (comma/newline separated or array). Custom preset only gets these. */
  readonly models?: string | ReadonlyArray<string>;
}

export function parseModelSlugs(value: string | ReadonlyArray<string> | undefined): string[] {
  const parts = typeof value === "string" ? value.split(/[\n,]/) : (value ?? []);
  const seen = new Set<string>();
  for (const part of parts) {
    const slug = part.trim();
    if (slug) seen.add(slug);
  }
  return [...seen];
}

export function validateByokInput(input: ByokProviderInput): string | null {
  if (input.apiKey.trim().length === 0) return "API key is required.";
  const baseUrl = input.baseUrl?.trim();
  if (input.preset === "custom" && !baseUrl) return "Base URL is required.";
  if (baseUrl) {
    try {
      const url = new URL(baseUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") return "Base URL must be http(s).";
    } catch {
      return "Base URL is not a valid URL.";
    }
  }
  return null;
}

export function defaultByokInstanceId(preset: ByokPreset): string {
  return preset === "openrouter" ? "claude_openrouter" : "claude_byok";
}

/** Pure builder: validated input -> provider instance envelope (never logs the key). */
export function buildByokProviderInstance(input: ByokProviderInput): ProviderInstanceConfig {
  const baseUrl = (input.baseUrl?.trim() || OPENROUTER_BASE_URL).replace(/\/+$/, "");
  const extra = parseModelSlugs(input.models);
  const defaults = input.preset === "openrouter" ? OPENROUTER_DEFAULT_MODELS : [];
  const known = new Set(defaults.map((m) => m.slug));
  const customModels = [
    ...defaults.map((m) => ({ slug: m.slug, name: m.name })),
    ...extra.filter((slug) => !known.has(slug)).map((slug) => ({ slug })),
  ];
  const label = input.label?.trim();
  return {
    driver: ProviderDriverKind.make("claudeAgent"),
    enabled: true,
    displayName: label || (input.preset === "openrouter" ? "OpenRouter" : "Custom API"),
    environment: [
      { name: "ANTHROPIC_BASE_URL", value: baseUrl, sensitive: false },
      { name: "ANTHROPIC_AUTH_TOKEN", value: input.apiKey.trim(), sensitive: true },
      { name: "ANTHROPIC_API_KEY", value: "", sensitive: false },
    ],
    config: { customModels },
  };
}
