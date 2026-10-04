// FUNIBER fork: Hermes pinned at the top of the sidebar as an always-on bot.
// One click opens a project-less thread already set to the Hermes provider,
// creating the Hermes provider instance on first use.
import { ProviderInstanceId } from "@t3tools/contracts";
import { useCallback, useState } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { useScratchProject } from "../../hooks/useScratchProject";
import {
  useEnvironmentSettings,
  usePersistEnvironmentProviderInstanceMutation,
} from "../../hooks/useSettings";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { toastManager } from "../ui/toast";
import {
  buildHermesProviderInstance,
  findHermesInstanceId,
  nextHermesInstanceId,
} from "../settings/hermesProvider.logic";

export function HermesPinnedBot() {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  if (primaryEnvironmentId === null) return null;
  return <HermesPinnedBotRow environmentId={primaryEnvironmentId} />;
}

function HermesPinnedBotRow({
  environmentId,
}: {
  environmentId: NonNullable<ReturnType<typeof usePrimaryEnvironmentId>>;
}) {
  const settings = useEnvironmentSettings(environmentId);
  const persist = usePersistEnvironmentProviderInstanceMutation(environmentId);
  const { openScratchProject } = useScratchProject();
  const handleNewThread = useNewThreadHandler();
  const [busy, setBusy] = useState(false);

  const ensureHermesInstance = useCallback(async (): Promise<ProviderInstanceId | null> => {
    const instances = settings.providerInstances ?? {};
    const existing = findHermesInstanceId(instances);
    if (existing !== null) return ProviderInstanceId.make(existing);
    const instanceId = nextHermesInstanceId(instances);
    const result = await persist({
      operation: "create",
      instanceId,
      instance: buildHermesProviderInstance(),
    });
    if (result._tag === "Failure") {
      toastManager.add({
        type: "error",
        title: "Could not set up Hermes",
        description: "Install Hermes Agent (hermes) and try again.",
      });
      return null;
    }
    return instanceId;
  }, [persist, settings.providerInstances]);

  const openHermes = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const instanceId = await ensureHermesInstance();
      if (instanceId === null) return;
      const project = await openScratchProject(environmentId, "Could not open Hermes");
      if (!project) return;
      const created = await handleNewThread(scopeProjectRef(project.environmentId, project.id));
      if (!created) return;
      useComposerDraftStore
        .getState()
        .setModelSelection(
          created.draftId,
          { instanceId, model: "default" },
          { explicit: true, replaceOptions: true },
        );
    } finally {
      setBusy(false);
    }
  }, [busy, ensureHermesInstance, environmentId, handleNewThread, openScratchProject]);

  return (
    <button
      type="button"
      onClick={() => void openHermes()}
      disabled={busy}
      className="group mx-2 mb-1 flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-foreground outline-hidden hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      aria-label="Open Hermes"
    >
      <img
        src="/hermes-icon.svg"
        alt=""
        aria-hidden
        className="size-6 shrink-0 select-none rounded-md"
      />
      <span className="min-w-0 flex-1 truncate font-medium">Hermes</span>
      <span className="text-xs text-muted-foreground">{busy ? "Opening…" : "Bot"}</span>
    </button>
  );
}
