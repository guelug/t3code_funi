// FUNIBER fork: one-click Hermes Agent provider (local `hermes acp`).
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { ProviderInstanceId, type EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";

import {
  useEnvironmentSettings,
  usePersistEnvironmentProviderInstanceMutation,
} from "../../hooks/useSettings";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import {
  buildHermesProviderInstance,
  findHermesInstanceId,
  nextHermesInstanceId,
} from "./hermesProvider.logic";

export function AddHermesButton(props: {
  readonly environmentId: EnvironmentId;
  readonly onSelected?: (id: ProviderInstanceId) => void;
}) {
  const settings = useEnvironmentSettings(props.environmentId);
  const persist = usePersistEnvironmentProviderInstanceMutation(props.environmentId);
  const [saving, setSaving] = useState(false);

  const add = async () => {
    const instances = settings.providerInstances ?? {};
    const existing = findHermesInstanceId(instances);
    if (existing !== null) {
      props.onSelected?.(ProviderInstanceId.make(existing));
      return;
    }
    const instanceId = nextHermesInstanceId(instances);
    setSaving(true);
    const result = await persist({
      operation: "create",
      instanceId,
      instance: buildHermesProviderInstance(),
    });
    setSaving(false);
    if (result._tag === "Failure") {
      const cause = squashAtomCommandFailure(result);
      toastManager.add({
        type: "error",
        title: "Could not add Hermes",
        description: cause instanceof Error ? cause.message : "The settings update failed.",
      });
      return;
    }
    toastManager.add({
      type: "success",
      title: "Hermes added",
      description:
        "Uses your local `hermes` and its own providers. Sign in from the card if asked.",
    });
    props.onSelected?.(instanceId);
  };

  return (
    <Button size="xs" variant="ghost-muted" disabled={saving} onClick={() => void add()}>
      Hermes
    </Button>
  );
}
