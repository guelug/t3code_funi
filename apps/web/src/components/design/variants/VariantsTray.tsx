import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect } from "react";

import { Button } from "~/components/ui/button";
import {
  useProjectEntriesQuery,
  useProjectFileQuery,
} from "~/components/files/projectFilesQueryState";

import { extractFragment, listVariantFiles, VARIANTS_DIR } from "./variants.logic";

function VariantCard(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly path: string;
  readonly canApply: boolean;
  readonly mutationId: string | null;
  readonly onApply: (fragment: string) => void;
}) {
  const query = useProjectFileQuery(props.environmentId, props.cwd, props.path);
  const { refresh } = query;
  useEffect(() => {
    if (props.mutationId !== null) refresh();
  }, [props.mutationId, refresh]);
  const contents = query.data?.contents ?? null;
  return (
    <div className="flex w-48 shrink-0 flex-col gap-1">
      {contents === null ? (
        <div className="flex h-28 items-center justify-center rounded border text-muted-foreground text-xs">
          Loading…
        </div>
      ) : (
        <iframe
          title={`Variant ${props.path}`}
          srcDoc={contents}
          sandbox="allow-scripts allow-forms allow-modals"
          className="h-28 w-full rounded border bg-white"
        />
      )}
      <div className="flex items-center justify-between gap-1 text-xs">
        <span className="truncate text-muted-foreground">{props.path.split("/").pop()}</span>
        <Button
          size="xs"
          variant="ghost"
          disabled={contents === null || !props.canApply}
          onClick={() => contents !== null && props.onApply(extractFragment(contents))}
        >
          Apply
        </Button>
      </div>
    </div>
  );
}

/** Tray listing design/variants/*.html with sandboxed previews and an Apply action. */
export function VariantsTray(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly mutationId: string | null;
  readonly canApply: boolean;
  readonly error: string | null;
  readonly onApply: (fragment: string) => void;
  readonly onClose: () => void;
}) {
  const entries = useProjectEntriesQuery(props.environmentId, props.cwd, VARIANTS_DIR);
  const { refresh } = entries;
  useEffect(() => {
    if (props.mutationId !== null) refresh();
  }, [props.mutationId, refresh]);
  const files = listVariantFiles(entries.data?.entries ?? []);
  return (
    <div className="shrink-0 border-b px-2 py-1.5">
      <div className="mb-1 flex items-center gap-2 text-xs">
        <span className="font-medium">Variants</span>
        {props.error ? <span className="text-destructive">{props.error}</span> : null}
        {!props.canApply ? (
          <span className="text-muted-foreground">
            Select an element and press Variants to enable Apply.
          </span>
        ) : null}
        <Button size="xs" variant="ghost-muted" className="ml-auto" onClick={props.onClose}>
          Close
        </Button>
      </div>
      {files.length === 0 ? (
        <div className="text-muted-foreground text-xs">
          No variant files yet. Waiting for the agent to write {VARIANTS_DIR}/…
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {files.map((path) => (
            <VariantCard
              key={path}
              environmentId={props.environmentId}
              cwd={props.cwd}
              path={path}
              canApply={props.canApply}
              mutationId={props.mutationId}
              onApply={props.onApply}
            />
          ))}
        </div>
      )}
    </div>
  );
}
