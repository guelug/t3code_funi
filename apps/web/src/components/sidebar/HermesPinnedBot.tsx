// FUNIBER fork: Hermes pinned at the top of the sidebar as an always-on bot.
// One click opens a project-less thread already set to the Hermes provider for
// the chosen Hermes profile (creating that provider instance on first use).
import { useAtomValue } from "@effect/atom-react";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { ChevronDownIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { useComposerDraftStore } from "../../composerDraftStore";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useScratchProject } from "../../hooks/useScratchProject";
import {
  useEnvironmentSettings,
  usePersistEnvironmentProviderInstanceMutation,
} from "../../hooks/useSettings";
import { getDefaultProviderInstanceModel } from "../../providerInstances";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { filesystemEnvironment } from "../../state/filesystem";
import { useEnvironmentQuery } from "../../state/query";
import { primaryServerProvidersAtom } from "../../state/server";
import { getProjectFileQueryAtom } from "../files/projectFilesQueryState";
import {
  buildHermesProviderInstance,
  HERMES_DEFAULT_PROFILE,
  hermesAgentNameFromSoul,
  hermesBotDisplayName,
  hermesRootFromProfileHome,
  hermesSoulPath,
  hermesInstanceIdForProfile,
  hermesProfilesFromEntries,
  type HermesProfile,
} from "../settings/hermesProvider.logic";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { toastManager } from "../ui/toast";

const PROFILE_STORAGE_KEY = "funi:hermes-profile";

function readStoredProfile(): string {
  try {
    return window.localStorage.getItem(PROFILE_STORAGE_KEY) ?? HERMES_DEFAULT_PROFILE;
  } catch {
    return HERMES_DEFAULT_PROFILE;
  }
}

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
  const providers = useAtomValue(primaryServerProvidersAtom);
  const { openScratchProject } = useScratchProject();
  const handleNewThread = useNewThreadHandler();
  const [busy, setBusy] = useState(false);
  const [profileName, setProfileName] = useState(readStoredProfile);

  const profilesQuery = useEnvironmentQuery(
    filesystemEnvironment.browse({
      environmentId,
      input: { partialPath: "~/.hermes/profiles/" },
    }),
  );
  const profiles = useMemo(
    () => hermesProfilesFromEntries(profilesQuery.data?.entries ?? []),
    [profilesQuery.data],
  );
  const profile: HermesProfile = profiles.find((entry) => entry.name === profileName) ?? {
    name: HERMES_DEFAULT_PROFILE,
    home: null,
  };

  // FUNIBER fork: the bot takes its persona name from the profile's SOUL.md.
  const hermesRoot = useMemo(() => {
    const named = profiles.find((entry) => entry.home !== null)?.home;
    return named ? hermesRootFromProfileHome(named) : null;
  }, [profiles]);
  const soulPath = hermesSoulPath(profile, hermesRoot);
  const soulQuery = useEnvironmentQuery(
    soulPath && hermesRoot ? getProjectFileQueryAtom(environmentId, hermesRoot, soulPath) : null,
  );
  const soulName = soulQuery.data ? hermesAgentNameFromSoul(soulQuery.data.contents) : null;
  const botName = hermesBotDisplayName(profile, soulName);

  const ensureInstance = useCallback(
    async (target: HermesProfile) => {
      const instanceId = hermesInstanceIdForProfile(target.name);
      const instance = buildHermesProviderInstance(
        target,
        target.name === profile.name ? soulName : null,
      );
      const existing = settings.providerInstances?.[instanceId];
      if (existing !== undefined && existing.displayName === instance.displayName) {
        return instanceId;
      }
      const result = await persist({
        operation: existing === undefined ? "create" : "upsert",
        instanceId,
        instance:
          existing === undefined ? instance : { ...existing, displayName: instance.displayName },
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
    },
    [persist, profile.name, settings.providerInstances, soulName],
  );

  const openHermes = useCallback(
    async (target: HermesProfile) => {
      if (busy) return;
      setBusy(true);
      try {
        const instanceId = await ensureInstance(target);
        if (instanceId === null) return;
        const project = await openScratchProject(environmentId, "Could not open Hermes");
        if (!project) return;
        const created = await handleNewThread(scopeProjectRef(project.environmentId, project.id));
        if (!created) return;
        // Hermes advertises its current model; fall back to the agent default.
        const model = getDefaultProviderInstanceModel(providers, instanceId) ?? "default";
        useComposerDraftStore
          .getState()
          .setModelSelection(
            created.draftId,
            { instanceId, model },
            { explicit: true, replaceOptions: true },
          );
      } finally {
        setBusy(false);
      }
    },
    [busy, ensureInstance, environmentId, handleNewThread, openScratchProject, providers],
  );

  const selectProfile = (next: HermesProfile) => {
    setProfileName(next.name);
    try {
      window.localStorage.setItem(PROFILE_STORAGE_KEY, next.name);
    } catch {
      // Storage is optional; the choice still applies for this session.
    }
    void openHermes(next);
  };

  return (
    <div className="mx-2 mb-1 flex items-center gap-1">
      <button
        type="button"
        onClick={() => void openHermes(profile)}
        disabled={busy}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm text-foreground outline-hidden hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        aria-label={`Open ${botName} (Hermes ${profile.name} profile)`}
      >
        <img
          src="/hermes-icon.svg"
          alt=""
          aria-hidden
          className="size-6 shrink-0 select-none rounded-md"
        />
        <span className="min-w-0 flex-1 truncate font-medium">{botName}</span>
        <span className="truncate text-xs text-muted-foreground">
          {busy ? "Opening…" : profile.name}
        </span>
      </button>
      <Menu>
        <MenuTrigger
          render={
            <button
              type="button"
              aria-label="Choose Hermes profile"
              className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-hidden hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            />
          }
        >
          <ChevronDownIcon className="size-3.5" />
        </MenuTrigger>
        <MenuPopup align="end">
          {profiles.map((entry) => (
            <MenuItem key={entry.name} onClick={() => selectProfile(entry)}>
              {entry.name === profile.name ? `✓ ${entry.name}` : entry.name}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
    </div>
  );
}
