/** Minimal parser for <question-form> blocks (protocol from Open Design, Apache-2.0). */
export type QuestionType =
  | "radio"
  | "checkbox"
  | "select"
  | "text"
  | "textarea"
  | "number"
  | "range"
  | "color"
  | "url"
  | "switch";

export interface FormOption {
  readonly label: string;
  readonly value: string;
}
export interface FormQuestion {
  readonly id: string;
  readonly label: string;
  readonly type: QuestionType;
  readonly options?: readonly FormOption[] | undefined;
  readonly placeholder?: string | undefined;
  readonly required?: boolean | undefined;
  readonly default?: string | readonly string[] | boolean | undefined;
}
export interface QuestionForm {
  readonly id: string;
  readonly title: string;
  readonly questions: readonly FormQuestion[];
}
export type FormSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "form"; readonly form: QuestionForm };

const TYPES = new Set([
  "radio",
  "checkbox",
  "select",
  "text",
  "textarea",
  "number",
  "range",
  "color",
  "url",
  "switch",
]);
const BLOCK = /<(question-form|ask-question)\s+([^>]*)>([\s\S]*?)<\/\1>/g;

function attr(attrs: string, name: string): string {
  return new RegExp(`${name}="([^"]*)"`).exec(attrs)?.[1] ?? "";
}

function normalizeQuestion(raw: unknown): FormQuestion | null {
  if (typeof raw !== "object" || raw === null) return null;
  const q = raw as Record<string, unknown>;
  if (typeof q.id !== "string" || typeof q.label !== "string") return null;
  const type = typeof q.type === "string" && TYPES.has(q.type) ? (q.type as QuestionType) : "text";
  const options = Array.isArray(q.options)
    ? q.options.flatMap((o): FormOption[] =>
        typeof o === "string"
          ? [{ label: o, value: o }]
          : typeof o === "object" && o !== null && typeof (o as FormOption).label === "string"
            ? [
                {
                  label: (o as FormOption).label,
                  value: String((o as FormOption).value ?? (o as FormOption).label),
                },
              ]
            : [],
      )
    : undefined;
  return {
    id: q.id,
    label: q.label,
    type,
    ...(options ? { options } : {}),
    ...(typeof q.placeholder === "string" ? { placeholder: q.placeholder } : {}),
    ...(q.required === true ? { required: true } : {}),
    ...(q.default !== undefined
      ? { default: q.default as NonNullable<FormQuestion["default"]> }
      : {}),
  };
}

/** Splits text into prose + forms. Invalid JSON bodies stay as plain text. Max 5 questions kept. */
export function parseQuestionForms(text: string): FormSegment[] {
  const segments: FormSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(BLOCK)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[3]!.trim());
    } catch {
      continue;
    }
    const rawQs = (parsed as { questions?: unknown }).questions;
    if (!Array.isArray(rawQs)) continue;
    const questions = rawQs
      .map(normalizeQuestion)
      .filter((q): q is FormQuestion => q !== null)
      .slice(0, 5);
    if (questions.length === 0) continue;
    const start = match.index ?? 0;
    if (start > last) segments.push({ kind: "text", text: text.slice(last, start) });
    segments.push({
      kind: "form",
      form: {
        id: attr(match[2]!, "id") || "discovery",
        title: attr(match[2]!, "title"),
        questions,
      },
    });
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ kind: "text", text: text.slice(last) });
  return segments;
}

export type FormAnswers = Readonly<Record<string, string | readonly string[] | boolean>>;

/** Builds the user reply the discovery rules key on: `[form answers — <id>]`. */
export function formatFormAnswers(form: QuestionForm, answers: FormAnswers): string {
  const lines = [`[form answers — ${form.id}]`];
  for (const q of form.questions) {
    const a = answers[q.id];
    const values = Array.isArray(a) ? a : a === undefined || a === "" ? [] : [String(a)];
    const shown = values.map((v) => {
      const opt = q.options?.find((o) => o.value === v);
      return opt && opt.label !== opt.value ? `${opt.label} [value: ${opt.value}]` : v;
    });
    lines.push(`- ${q.label} (${q.id}): ${shown.length ? shown.join(", ") : "—"}`);
  }
  return lines.join("\n");
}

const OPEN_TAIL =
  /<(?:question-form|ask-question)\b(?![^>]*>[\s\S]*<\/(?:question-form|ask-question)>)[\s\S]*$|<(?:q(?:u(?:e(?:s(?:t(?:i(?:o(?:n(?:-(?:f(?:o(?:r(?:m)?)?)?)?)?)?)?)?)?)?)?|a(?:s(?:k(?:-(?:q(?:u(?:e(?:s(?:t(?:i(?:o(?:n)?)?)?)?)?)?)?)?)?)?)?)?)?$/;

/**
 * Parse for rendering during streaming: an unterminated trailing `<question-form ...` block
 * (or a partial opening tag) is dropped from the text so raw JSON never flashes; the card
 * appears once the closing tag arrives.
 */
export function splitQuestionFormSegments(text: string): FormSegment[] {
  const segments = parseQuestionForms(text);
  const last = segments[segments.length - 1];
  if (last?.kind === "text") {
    const cut = last.text.search(OPEN_TAIL);
    if (cut >= 0) {
      const kept = last.text.slice(0, cut);
      segments.pop();
      if (kept.trim().length > 0) segments.push({ kind: "text", text: kept });
    }
  }
  return segments;
}
