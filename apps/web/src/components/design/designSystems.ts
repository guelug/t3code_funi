/**
 * Bundled DESIGN.md starters (original content, 9-section shape inspired by the
 * open DESIGN.md convention: palette, type, spacing, radius, elevation, motion,
 * components, voice, anti-patterns). The agent receives the chosen file verbatim.
 */
export interface DesignSystem {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly swatches: readonly string[];
  readonly markdown: string;
}

const FUNIBER = `# DESIGN.md — FUNIBER

## 1. Palette
- Primary: #00699E (hover #006696). Use for actions, links, active states.
- Text: #4C4C4E body, #1F1F20 headings. Muted: #8A8A8E.
- Surface: #FFFFFF page, #F4F6F8 sections, border #E1E5EA.
- Accent (sparingly): #E8A33D for highlights and badges.
- Contrast: body text must reach WCAG AA on its surface.

## 2. Typography
- Family: "Inter", system-ui, sans-serif. Headings 600, body 400.
- Scale (px): 12 / 14 / 16 / 20 / 28 / 40. Line-height 1.5 body, 1.2 headings.

## 3. Spacing
- 4px base grid. Section padding 64px desktop, 32px mobile. Content max-width 1120px.

## 4. Radius & elevation
- Radius 8px controls, 12px cards. One soft shadow: 0 2px 12px rgba(0,0,0,.08).

## 5. Motion
- 150–200ms ease-out for hover/focus only. No looping or parallax animation.

## 6. Components
- Buttons: solid primary, outlined secondary; 44px min tap height.
- Cards: white, 1px border, 12px radius, no heavy shadows.
- Forms: visible labels above fields, inline error text in #B3261E.

## 7. Layout
- Mobile-first. 12-column grid on desktop, single column under 640px.

## 8. Voice
- Academic yet warm. Clear, concrete, second person. Spanish-first copy unless told otherwise.

## 9. Anti-patterns
- No gradients on text, no neon colors, no stock-photo clichés, no centered long paragraphs, no more than two font weights per view.
`;

const MINIMAL = `# DESIGN.md — Neutral Minimal

## 1. Palette
- Background #FFFFFF, subtle #FAFAFA, border #E5E5E5.
- Text #111111, muted #6B6B6B. Single accent #111111 (inverse buttons).

## 2. Typography
- System sans stack. Sizes 13 / 15 / 18 / 24 / 36. Weights 400 and 600 only.

## 3. Spacing
- 8px grid. Generous whitespace: 96px between sections, 24px inside cards.

## 4. Radius & elevation
- Radius 6px. No shadows; separate with 1px borders.

## 5. Motion
- Opacity/color transitions 120ms. Nothing moves.

## 6. Components
- Buttons: black solid and plain text. Links underlined on hover.
- Lists and tables over cards.

## 7. Layout
- Single column, max-width 680px for reading, 1040px for grids.

## 8. Voice
- Short, factual, no exclamation marks.

## 9. Anti-patterns
- No color beyond the accent, no icons as decoration, no hero illustrations, no gradients.
`;

const DARK = `# DESIGN.md — Dark Studio

## 1. Palette
- Background #0B0D10, surface #14181D, raised #1C2128, border #2A313A.
- Text #E8EAED, muted #98A1AC. Accent #4DA3FF; success #3DD68C; danger #FF6B6B.

## 2. Typography
- "Inter", system-ui. Mono: ui-monospace for data. Sizes 12 / 14 / 16 / 22 / 32.

## 3. Spacing
- 4px grid, compact density: 12px padding in controls, 20px in panels.

## 4. Radius & elevation
- Radius 8px. Depth from lighter surfaces, not shadows. Focus ring 2px accent.

## 5. Motion
- 120ms ease for hover/focus. Respect prefers-reduced-motion.

## 6. Components
- Ghost buttons by default, one filled accent button per view.
- Tables with hairline rows, sticky headers.

## 7. Layout
- App-shell: fixed sidebar 240px, content fluid, max 1280px.

## 8. Voice
- Precise and technical, lowercase labels.

## 9. Anti-patterns
- No pure #000 or #FFF, no colored glows, no more than one accent hue, no low-contrast gray-on-gray text.
`;

const EDITORIAL = `# DESIGN.md — Editorial Warm

## 1. Palette
- Paper #FAF6F0, ink #221E1A, muted #7A6F64, rule #E4DAC9, accent #B5452C.

## 2. Typography
- Headings: "Georgia", serif, 600. Body: "Inter", system-ui 400. Sizes 14 / 17 / 22 / 34 / 56.
- Body line-height 1.65, measure 62ch.

## 3. Spacing
- 8px grid; vertical rhythm of 24px; large margins around headlines.

## 4. Radius & elevation
- Radius 2px. Hairline rules instead of shadows.

## 5. Motion
- Fade-in on load only (200ms), never looping.

## 6. Components
- Pull quotes, drop caps for articles, text-forward buttons with underline.

## 7. Layout
- Asymmetric two-column editorial grid, collapses to one column under 720px.

## 8. Voice
- Confident, literary, concrete nouns.

## 9. Anti-patterns
- No cards-in-cards, no icon grids, no saturated blues, no stock gradients.
`;

export const DESIGN_SYSTEMS: readonly DesignSystem[] = [
  {
    id: "funiber",
    name: "FUNIBER",
    summary: "Institutional blue, calm grays, academic tone.",
    swatches: ["#00699E", "#4C4C4E", "#F4F6F8", "#E8A33D"],
    markdown: FUNIBER,
  },
  {
    id: "minimal",
    name: "Neutral Minimal",
    summary: "Black on white, whitespace, no decoration.",
    swatches: ["#111111", "#6B6B6B", "#E5E5E5", "#FFFFFF"],
    markdown: MINIMAL,
  },
  {
    id: "dark",
    name: "Dark Studio",
    summary: "Compact dark app UI with a single blue accent.",
    swatches: ["#0B0D10", "#1C2128", "#4DA3FF", "#E8EAED"],
    markdown: DARK,
  },
  {
    id: "editorial",
    name: "Editorial Warm",
    summary: "Paper tones, serif headlines, long-form reading.",
    swatches: ["#FAF6F0", "#221E1A", "#B5452C", "#E4DAC9"],
    markdown: EDITORIAL,
  },
];

export function findDesignSystem(id: string | null): DesignSystem | null {
  return DESIGN_SYSTEMS.find((system) => system.id === id) ?? null;
}
