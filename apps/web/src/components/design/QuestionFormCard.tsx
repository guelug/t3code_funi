import { useState } from "react";

import { Button } from "~/components/ui/button";
import {
  formatFormAnswers,
  type FormAnswers,
  type FormQuestion,
  type QuestionForm,
} from "./questionForm";

function initial(q: FormQuestion): FormAnswers[string] {
  if (q.default !== undefined) return q.default;
  return q.type === "checkbox" ? [] : q.type === "switch" ? false : "";
}

/**
 * Renders an agent `<question-form>` block. On submit it calls `onSubmit` with the
 * `[form answers — <id>]` message. Hooked in AssistantTimelineRow (MessagesTimeline.tsx); `disabled` makes it read-only for older messages.
 */
export function QuestionFormCard(props: {
  readonly form: QuestionForm;
  readonly onSubmit: (message: string) => void;
  readonly disabled?: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, FormAnswers[string]>>(() =>
    Object.fromEntries(props.form.questions.map((q) => [q.id, initial(q)])),
  );
  const set = (id: string, value: FormAnswers[string]) =>
    setAnswers((prev) => ({ ...prev, [id]: value }));
  const missing = props.form.questions.some(
    (q) =>
      q.required &&
      (answers[q.id] === "" ||
        (Array.isArray(answers[q.id]) && (answers[q.id] as string[]).length === 0)),
  );
  const field = "w-full rounded-md border bg-background px-2 py-1 text-sm";

  return (
    <form
      className="my-2 space-y-3 rounded-lg border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!missing) props.onSubmit(formatFormAnswers(props.form, answers));
      }}
    >
      <fieldset
        disabled={props.disabled}
        className={props.disabled ? "space-y-3 opacity-70" : "space-y-3"}
      >
        {props.form.title ? <div className="font-medium text-sm">{props.form.title}</div> : null}
        {props.form.questions.map((q) => (
          <fieldset key={q.id} className="space-y-1">
            <legend className="text-xs font-medium">
              {q.label}
              {q.required ? " *" : ""}
            </legend>
            {q.type === "radio" || q.type === "checkbox" ? (
              (q.options ?? []).map((o) => {
                const current = answers[q.id];
                const checked = Array.isArray(current)
                  ? current.includes(o.value)
                  : current === o.value;
                return (
                  <label key={o.value} className="flex items-center gap-2 text-sm">
                    <input
                      type={q.type}
                      name={q.id}
                      checked={checked}
                      onChange={() =>
                        set(
                          q.id,
                          q.type === "radio"
                            ? o.value
                            : checked
                              ? (current as string[]).filter((v) => v !== o.value)
                              : [...(Array.isArray(current) ? current : []), o.value],
                        )
                      }
                    />
                    {o.label}
                  </label>
                );
              })
            ) : q.type === "select" ? (
              <select
                className={field}
                value={String(answers[q.id] ?? "")}
                onChange={(e) => set(q.id, e.target.value)}
              >
                <option value="" />
                {(q.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : q.type === "textarea" ? (
              <textarea
                className={field}
                placeholder={q.placeholder}
                value={String(answers[q.id] ?? "")}
                onChange={(e) => set(q.id, e.target.value)}
              />
            ) : q.type === "switch" ? (
              <input
                type="checkbox"
                checked={answers[q.id] === true}
                onChange={(e) => set(q.id, e.target.checked)}
              />
            ) : (
              <input
                className={field}
                type={
                  q.type === "color" ||
                  q.type === "number" ||
                  q.type === "range" ||
                  q.type === "url"
                    ? q.type
                    : "text"
                }
                placeholder={q.placeholder}
                value={String(answers[q.id] ?? "")}
                onChange={(e) => set(q.id, e.target.value)}
              />
            )}
          </fieldset>
        ))}
        <Button type="submit" size="xs" disabled={missing || props.disabled}>
          {props.disabled ? "Respondido / no disponible" : "Enviar respuestas"}
        </Button>
      </fieldset>
    </form>
  );
}
