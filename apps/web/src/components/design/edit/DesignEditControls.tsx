import { MessageSquare, MousePointer2, Send } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";

import type { FdMode } from "./bridge";
import type { DesignComment } from "./comments";

/** Toolbar toggles (Edit / Comment) rendered inline in the design toolbar. */
export function DesignEditToggles(props: {
  readonly mode: FdMode;
  readonly disabled: boolean;
  readonly onChange: (mode: FdMode) => void;
}) {
  const toggle = (target: Exclude<FdMode, "off">) =>
    props.onChange(props.mode === target ? "off" : target);
  return (
    <>
      <Button
        size="xs"
        variant={props.mode === "edit" ? "ghost" : "ghost-muted"}
        aria-pressed={props.mode === "edit"}
        disabled={props.disabled}
        onClick={() => toggle("edit")}
      >
        <MousePointer2 />
        Edit
      </Button>
      <Button
        size="xs"
        variant={props.mode === "comment" ? "ghost" : "ghost-muted"}
        aria-pressed={props.mode === "comment"}
        disabled={props.disabled}
        onClick={() => toggle("comment")}
      >
        <MessageSquare />
        Comment
      </Button>
    </>
  );
}

/** Strip under the toolbar: error, pending note input, queued comments + send. */
export function DesignEditStatus(props: {
  readonly error: string | null;
  readonly pending: { readonly path: string; readonly snippet: string } | null;
  readonly comments: readonly DesignComment[];
  readonly onAdd: (note: string) => void;
  readonly onCancel: () => void;
  readonly onSend: () => void;
  /** Ask the agent for element-scoped variants of the pending selection. */
  readonly onVariants?: (instruction: string) => void;
}) {
  const [note, setNote] = useState("");
  if (!props.error && !props.pending && props.comments.length === 0) return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-2 py-1 text-xs">
      {props.error ? <span className="text-destructive">{props.error}</span> : null}
      {props.pending ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            props.onAdd(note);
            setNote("");
          }}
        >
          <code className="max-w-40 truncate text-muted-foreground">#{props.pending.path}</code>
          <input
            autoFocus
            aria-label="Comment note"
            placeholder="What should change?"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="h-6 min-w-0 flex-1 rounded-md bg-accent/50 px-2 outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <Button size="xs" type="submit" variant="ghost" disabled={note.trim().length === 0}>
            Add
          </Button>
          {props.onVariants ? (
            <Button
              size="xs"
              type="button"
              variant="ghost"
              onClick={() => {
                props.onVariants?.(note);
                setNote("");
              }}
            >
              Variants
            </Button>
          ) : null}
          <Button size="xs" type="button" variant="ghost-muted" onClick={props.onCancel}>
            Cancel
          </Button>
        </form>
      ) : null}
      {props.comments.length > 0 ? (
        <Button size="xs" variant="ghost" onClick={props.onSend}>
          <Send />
          Send comments to agent ({props.comments.length})
        </Button>
      ) : null}
    </div>
  );
}
