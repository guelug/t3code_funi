import type { EnvironmentId } from "@t3tools/contracts";
import { useCallback, useRef, useState } from "react";

import { confirmProjectFileQueryData } from "~/components/files/projectFilesQueryState";
import { projectEnvironment } from "~/state/projects";
import { useAtomCommand } from "~/state/use-atom-command";

import {
  applyVariant,
  buildVariantsPrompt,
  DEFAULT_VARIANT_COUNT,
  newVariantId,
  tagOfSnippet,
} from "./variants.logic";

/** Variant request + tray state; Apply writes through the same writeFile path as Edit. */
export function useDesignVariants(input: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly file: string;
  readonly html: string | null;
  readonly onSend: (message: string) => void;
}) {
  const { environmentId, cwd, file, html, onSend } = input;
  const writeFile = useAtomCommand(projectEnvironment.writeFile);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<{ path: string; tag: string; snippet: string } | null>(null);
  const htmlRef = useRef(html);
  htmlRef.current = html;

  const request = useCallback(
    (selection: { path: string; snippet: string }, instruction: string) => {
      const tag = tagOfSnippet(selection.snippet);
      setTarget({ path: selection.path, tag, snippet: selection.snippet });
      setOpen(true);
      setError(null);
      onSend(
        buildVariantsPrompt({
          id: newVariantId(),
          file,
          path: selection.path,
          tag,
          snippet: selection.snippet,
          instruction,
          count: DEFAULT_VARIANT_COUNT,
        }),
      );
    },
    [file, onSend],
  );

  const apply = useCallback(
    (fragment: string) => {
      const current = htmlRef.current;
      if (current === null || target === null) return;
      const result = applyVariant(current, target.path, fragment, {
        tag: target.tag,
        snippet: target.snippet,
      });
      if (!result.ok) {
        setError(`Variant not applied: ${result.reason}`);
        return;
      }
      setError(null);
      htmlRef.current = result.html;
      confirmProjectFileQueryData(environmentId, cwd, file, result.html);
      void Promise.resolve(
        writeFile({ environmentId, input: { cwd, relativePath: file, contents: result.html } }),
      ).catch(() => setError("Variant could not be written to the workspace."));
    },
    [cwd, environmentId, file, target, writeFile],
  );

  return { open, setOpen, error, canApply: target !== null, request, apply };
}
