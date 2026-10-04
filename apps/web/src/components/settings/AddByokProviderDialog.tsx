"use client";

import { useState } from "react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { ProviderInstanceId, type EnvironmentId } from "@t3tools/contracts";

import {
  useEnvironmentSettings,
  usePersistEnvironmentProviderInstanceMutation,
} from "../../hooks/useSettings";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Input } from "../ui/input";
import { toastManager } from "../ui/toast";
import { WizardFooter, WizardHeader, WizardPanel, WizardPopup } from "../ui/wizard";
import {
  buildByokProviderInstance,
  defaultByokInstanceId,
  validateByokInput,
  type ByokPreset,
} from "./byokProvider.logic";

export function AddByokProviderDialog(props: {
  readonly open: boolean;
  readonly environmentId: EnvironmentId;
  readonly preset: ByokPreset;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated?: (id: ProviderInstanceId) => void;
}) {
  const settings = useEnvironmentSettings(props.environmentId);
  const persist = usePersistEnvironmentProviderInstanceMutation(props.environmentId);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [models, setModels] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const isOpenRouter = props.preset === "openrouter";

  const submit = async () => {
    const input = { preset: props.preset, apiKey, baseUrl, models };
    const invalid = validateByokInput(input);
    if (invalid) return setError(invalid);
    const existing = new Set(Object.keys(settings.providerInstances ?? {}));
    const base = defaultByokInstanceId(props.preset);
    let id = base;
    for (let n = 2; existing.has(id); n += 1) id = `${base}_${n}`;
    setSaving(true);
    const branded = ProviderInstanceId.make(id);
    const result = await persist({
      operation: "create",
      instanceId: branded,
      instance: buildByokProviderInstance(input),
    });
    setSaving(false);
    if (result._tag === "Failure") {
      const cause = squashAtomCommandFailure(result);
      return setError(cause instanceof Error ? cause.message : "The settings update failed.");
    }
    setApiKey("");
    toastManager.add({ type: "success", title: isOpenRouter ? "OpenRouter added" : "API added" });
    props.onCreated?.(branded);
    props.onOpenChange(false);
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <WizardPopup>
        <WizardHeader
          title={isOpenRouter ? "Add OpenRouter" : "Add custom API (BYOK)"}
          description="Uses the Claude agent with an Anthropic-compatible endpoint. The key is stored as a sensitive variable."
        />
        <WizardPanel>
          <div className="flex flex-col gap-3">
            <Input
              type="password"
              autoComplete="off"
              placeholder={isOpenRouter ? "OpenRouter API key (sk-or-…)" : "API key"}
              aria-label="API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
            <Input
              placeholder={
                isOpenRouter ? "Base URL (optional, https://openrouter.ai/api)" : "Base URL"
              }
              aria-label="Base URL"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <Input
              placeholder={
                isOpenRouter
                  ? "Extra model slugs (comma separated, optional)"
                  : "Model slugs (comma separated)"
              }
              aria-label="Models"
              value={models}
              onChange={(e) => setModels(e.target.value)}
            />
            {error ? <p className="text-xs text-destructive">{error}</p> : null}
          </div>
        </WizardPanel>
        <WizardFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void submit()}>
            {saving ? "Adding…" : "Add"}
          </Button>
        </WizardFooter>
      </WizardPopup>
    </Dialog>
  );
}
