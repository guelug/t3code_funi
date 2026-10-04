/** 5 curated visual directions, adapted from Open Design v0.23.1 (Apache-2.0, see /NOTICE). */
export interface DesignDirection {
  readonly id: string;
  readonly label: string;
  readonly mood: string;
  readonly displayFont: string;
  readonly bodyFont: string;
  readonly palette: Readonly<
    Record<"bg" | "surface" | "fg" | "muted" | "border" | "accent", string>
  >;
  readonly posture: readonly string[];
}

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif";

export const DESIGN_DIRECTIONS: readonly DesignDirection[] = [
  {
    id: "editorial-monocle",
    label: "Editorial — Monocle / FT magazine",
    mood: "Print-magazine feel for explicitly editorial briefs. Large serif headlines, neutral paper + ink + one accent. Not the default for SaaS or dashboards.",
    displayFont: "'Iowan Old Style', 'Charter', Georgia, serif",
    bodyFont: SANS,
    palette: {
      bg: "oklch(98% 0.004 95)",
      surface: "oklch(100% 0.002 95)",
      fg: "oklch(20% 0.018 70)",
      muted: "oklch(48% 0.012 70)",
      border: "oklch(90% 0.006 95)",
      accent: "oklch(52% 0.10 28)",
    },
    posture: [
      "serif display, sans body, mono only for metadata",
      "no shadows, no rounded cards — borders and whitespace",
      "one decisive image",
      "accent used at most twice",
    ],
  },
  {
    id: "modern-minimal",
    label: "Modern minimal — Linear / Vercel",
    mood: "Quiet, precise, software-native. Crisp neutrals plus a small visible product palette.",
    displayFont: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
    bodyFont: SANS,
    palette: {
      bg: "oklch(99% 0.002 240)",
      surface: "oklch(100% 0 0)",
      fg: "oklch(18% 0.012 250)",
      muted: "oklch(54% 0.012 250)",
      border: "oklch(92% 0.005 250)",
      accent: "oklch(58% 0.18 255)",
    },
    posture: [
      "tight letter-spacing on display sizes (-0.02em)",
      "hairline borders, shadows only on dropdowns/modals",
      "tabular-nums for numerics",
      "primary action color + one secondary signal + status colors",
    ],
  },
  {
    id: "human-approachable",
    label: "Human / approachable — Airbnb / Duolingo",
    mood: "Friendly and tactile on a clean neutral canvas. Generous radii, clear hierarchy. Consumer tools, education, travel.",
    displayFont: "'Avenir Next', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    bodyFont: SANS,
    palette: {
      bg: "oklch(98% 0.004 240)",
      surface: "oklch(100% 0 0)",
      fg: "oklch(20% 0.02 240)",
      muted: "oklch(50% 0.018 240)",
      border: "oklch(90% 0.006 240)",
      accent: "oklch(56% 0.12 170)",
    },
    posture: [
      "strong weight contrast in display",
      "radii 12–18px with crisp grid",
      "subtle elevation only on interactive cards",
      "real screenshots/data or labelled placeholders, no pastel washes",
    ],
  },
  {
    id: "tech-utility",
    label: "Tech / utility — Datadog / GitHub",
    mood: "Data-dense, monospace-friendly, built for operators who want information per square inch.",
    displayFont: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif",
    bodyFont: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', system-ui, sans-serif",
    palette: {
      bg: "oklch(98% 0.005 250)",
      surface: "oklch(100% 0 0)",
      fg: "oklch(22% 0.02 240)",
      muted: "oklch(50% 0.018 240)",
      border: "oklch(90% 0.008 240)",
      accent: "oklch(58% 0.16 145)",
    },
    posture: [
      "one sans family is fine",
      "tabular numerics, mono for IDs/code",
      "dense tables, hairline borders, no striping",
      "status pills with restrained tints; no hero images",
    ],
  },
  {
    id: "brutalist-experimental",
    label: "Brutalist / experimental — Are.na / Yale",
    mood: "Loud type, visible grid, deliberate ugliness as confidence. Art, indie, agency, manifestos.",
    displayFont: "'Times New Roman', 'Iowan Old Style', Georgia, serif",
    bodyFont: "ui-monospace, 'IBM Plex Mono', 'JetBrains Mono', Menlo, monospace",
    palette: {
      bg: "oklch(98% 0.004 240)",
      surface: "oklch(100% 0 0)",
      fg: "oklch(15% 0.02 100)",
      muted: "oklch(40% 0.02 100)",
      border: "oklch(15% 0.02 100)",
      accent: "oklch(60% 0.22 25)",
    },
    posture: [
      "serif display at extreme sizes clamp(80px,12vw,200px)",
      "monospace body",
      "full-strength 1.5–2px borders",
      "asymmetric 70/30 layouts, radius 0–2px, no shadows/gradients",
    ],
  },
];

export function renderDirectionBlock(): string {
  const out = [
    "## Direction library — infer and bind by default",
    "",
    "Pick the best match yourself (never ask the user to pick one when a design system is active) and bind it to `:root`.",
    "",
  ];
  for (const d of DESIGN_DIRECTIONS) {
    out.push(`### ${d.label} (id: ${d.id})`, `Mood: ${d.mood}`, "```css", ":root {");
    for (const [k, v] of Object.entries(d.palette)) out.push(`  --${k}: ${v};`);
    out.push(`  --font-display: ${d.displayFont};`, `  --font-body: ${d.bodyFont};`, "}", "```");
    for (const p of d.posture) out.push(`- ${p}`);
    out.push("");
  }
  return out.join("\n");
}
