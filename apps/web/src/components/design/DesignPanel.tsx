import type { EnvironmentId } from "@t3tools/contracts";
import { Download, Monitor, RefreshCw, Smartphone, Sparkles, Tablet } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "~/components/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useProjectFileQuery } from "~/components/files/projectFilesQueryState";
import { DesignEditStatus, DesignEditToggles } from "./edit/DesignEditControls";
import { useDesignEdit } from "./edit/useDesignEdit";
import { HistoryMenu } from "./history/HistoryMenu";
import { useDesignHistory } from "./history/useDesignHistory";
import { useDesignVariants } from "./variants/useDesignVariants";
import { VariantsTray } from "./variants/VariantsTray";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { Schema } from "effect";

import {
  DEFAULT_DESIGN_FILE,
  DESIGN_DEVICES,
  exportFileName,
  isHtmlPath,
  type DesignDeviceId,
} from "./design.logic";
import { buildDesignSystemPrompt } from "./designPrompt";
import {
  customSystemSummaries,
  loadDesignSystem,
  listDesignSystemSummaries,
} from "./designSystemsLoader";
import { isCustomSystemId, useCustomDesignSystemsStore } from "./customDesignSystemsStore";
import { ExportMenu } from "./export/ExportMenu";
import { FigmaMenu } from "./figma/FigmaMenu";

const SYSTEM_SUMMARIES = listDesignSystemSummaries();

const DEVICE_ICONS = { desktop: Monitor, tablet: Tablet, mobile: Smartphone } as const;

/**
 * Design surface: live preview of an HTML artifact from the project workspace.
 * The page renders via `srcDoc` in an iframe sandboxed WITHOUT allow-same-origin,
 * so generated scripts get an opaque origin and cannot reach the app's storage.
 * Refresh follows `workspaceMutationId` (bumped when the agent touches files).
 */
export default function DesignPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly workspaceMutationId: string | null;
  /** Appends the design brief to the thread composer. */
  readonly onSendBrief: (brief: string) => void;
}) {
  const [file, setFile] = useLocalStorage("t3code:design:file", DEFAULT_DESIGN_FILE, Schema.String);
  const [systemId, setSystemId] = useLocalStorage("t3code:design:system", "funiber", Schema.String);
  const [device, setDevice] = useState<DesignDeviceId>("desktop");
  const [draftFile, setDraftFile] = useState(file);

  const query = useProjectFileQuery(props.environmentId, props.cwd, isHtmlPath(file) ? file : null);
  const { refresh } = query;
  useEffect(() => {
    if (props.workspaceMutationId !== null) refresh();
  }, [props.workspaceMutationId, refresh]);

  const edit = useDesignEdit({
    environmentId: props.environmentId,
    cwd: props.cwd,
    file,
    html: query.data?.contents ?? null,
  });

  const variants = useDesignVariants({
    environmentId: props.environmentId,
    cwd: props.cwd,
    file,
    html: query.data?.contents ?? null,
    onSend: props.onSendBrief,
  });
  const history = useDesignHistory({
    environmentId: props.environmentId,
    cwd: props.cwd,
    file,
    html: query.data?.contents ?? null,
    workspaceMutationId: props.workspaceMutationId,
  });

  const customSystems = useCustomDesignSystemsStore((state) => state.systems);
  const allSystems = useMemo(
    () => [...SYSTEM_SUMMARIES, ...customSystemSummaries(customSystems)],
    [customSystems],
  );
  const system = allSystems.find((entry) => entry.id === systemId) ?? SYSTEM_SUMMARIES[0]!;
  const sendBrief = useCallback(async () => {
    const loaded = await loadDesignSystem(system.id);
    props.onSendBrief(buildDesignSystemPrompt({ system: loaded, file }));
  }, [system.id, file, props]);
  const width = DESIGN_DEVICES.find((entry) => entry.id === device)?.width ?? null;
  const html = query.data?.contents ?? null;

  const commitFile = useCallback(() => {
    const next = draftFile.trim();
    if (next.length > 0) setFile(next);
  }, [draftFile, setFile]);

  const exportHtml = useCallback(() => {
    if (html === null) return;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = exportFileName(file);
    link.click();
    URL.revokeObjectURL(url);
  }, [file, html]);

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-design-panel>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b px-2 py-1.5">
        <input
          aria-label="Design HTML file"
          value={draftFile}
          onChange={(event) => setDraftFile(event.target.value)}
          onBlur={commitFile}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="h-6 min-w-0 flex-1 rounded-md bg-accent/50 px-2 text-xs outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Menu>
          <MenuTrigger render={<Button size="xs" variant="ghost" aria-label="Design system" />}>
            {system.name}
          </MenuTrigger>
          <MenuPopup align="end" className="max-h-80 overflow-y-auto">
            <MenuRadioGroup value={system.id} onValueChange={(value) => setSystemId(String(value))}>
              {allSystems.map((entry) => (
                <MenuRadioItem key={entry.id} value={entry.id}>
                  {entry.name}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
            {isCustomSystemId(system.id) ? (
              <MenuItem
                onClick={() => {
                  useCustomDesignSystemsStore.getState().remove(system.id);
                  setSystemId("funiber");
                }}
              >
                Delete “{system.name}”
              </MenuItem>
            ) : null}
          </MenuPopup>
        </Menu>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="xs"
                variant="ghost"
                aria-label="Send design brief"
                onClick={() => void sendBrief()}
              >
                <Sparkles />
                Brief
              </Button>
            }
          />
          <TooltipPopup>Add the {system.name} DESIGN.md to your prompt</TooltipPopup>
        </Tooltip>
        {DESIGN_DEVICES.map((entry) => {
          const Icon = DEVICE_ICONS[entry.id];
          return (
            <Button
              key={entry.id}
              size="icon-xs"
              variant={device === entry.id ? "ghost" : "ghost-muted"}
              aria-label={entry.label}
              aria-pressed={device === entry.id}
              onClick={() => setDevice(entry.id)}
            >
              <Icon />
            </Button>
          );
        })}
        <DesignEditToggles mode={edit.mode} disabled={html === null} onChange={edit.changeMode} />
        <HistoryMenu
          snapshots={history.snapshots}
          onUndo={history.undo}
          onRestore={history.restore}
        />
        <Button
          size="xs"
          variant={variants.open ? "ghost" : "ghost-muted"}
          aria-pressed={variants.open}
          disabled={html === null}
          onClick={() => variants.setOpen(!variants.open)}
        >
          Variants
        </Button>
        <Button size="icon-xs" variant="ghost-muted" aria-label="Refresh preview" onClick={refresh}>
          <RefreshCw />
        </Button>
        <FigmaMenu
          html={html}
          file={file}
          onUseAsDesignSystem={(name, markdown) =>
            setSystemId(useCustomDesignSystemsStore.getState().add(name, markdown).id)
          }
        />
        <ExportMenu
          html={html}
          file={file}
          onExportHtml={exportHtml}
          designMd={async () => (await loadDesignSystem(system.id))?.markdown ?? null}
        />
      </div>
      <DesignEditStatus
        error={edit.error}
        pending={edit.pending}
        comments={edit.comments}
        onAdd={edit.addComment}
        onCancel={edit.cancelPending}
        onVariants={(instruction) => {
          if (!edit.pending) return;
          variants.request(edit.pending, instruction);
          edit.cancelPending();
        }}
        onSend={() => {
          props.onSendBrief(edit.commentsMessage());
          edit.clearComments();
        }}
      />
      {variants.open ? (
        <VariantsTray
          environmentId={props.environmentId}
          cwd={props.cwd}
          mutationId={props.workspaceMutationId}
          canApply={variants.canApply}
          error={variants.error ?? history.error}
          onApply={variants.apply}
          onClose={() => variants.setOpen(false)}
        />
      ) : null}
      <div className="flex min-h-0 flex-1 justify-center overflow-auto bg-muted/40">
        {html === null ? (
          <div className="m-auto max-w-xs p-6 text-center text-muted-foreground text-sm">
            {!isHtmlPath(file)
              ? "Pick an .html file to preview."
              : query.isPending
                ? "Loading…"
                : `No ${file} yet. Choose a design system, press Brief, and ask the agent to build it.`}
          </div>
        ) : (
          <iframe
            title="Design preview"
            ref={edit.iframeRef}
            onLoad={edit.announce}
            srcDoc={edit.srcDoc ?? html}
            sandbox="allow-scripts allow-forms allow-modals"
            className="min-h-0 border-0 bg-white"
            style={{ width: width ?? "100%", height: "100%", flexShrink: 0 }}
          />
        )}
      </div>
    </div>
  );
}
