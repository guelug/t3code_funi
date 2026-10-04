import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "../../lib/storage";

export interface CustomDesignSystem {
  readonly id: string;
  readonly name: string;
  readonly markdown: string;
}

export const CUSTOM_DESIGN_SYSTEMS_KEY = "t3code:design:custom-systems";
export const CUSTOM_SYSTEM_PREFIX = "custom:";
const MAX_SYSTEMS = 50;

interface State {
  readonly systems: readonly CustomDesignSystem[];
  /** Saves (or replaces same-name) system and returns it. */
  readonly add: (name: string, markdown: string) => CustomDesignSystem;
  readonly remove: (id: string) => void;
}

export function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "system"
  );
}

export function isCustomSystemId(id: string): boolean {
  return id.startsWith(CUSTOM_SYSTEM_PREFIX);
}

export function sanitizeCustomSystems(value: unknown): CustomDesignSystem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (v): v is CustomDesignSystem =>
        typeof v === "object" &&
        v !== null &&
        typeof (v as CustomDesignSystem).id === "string" &&
        (v as CustomDesignSystem).id.startsWith(CUSTOM_SYSTEM_PREFIX) &&
        typeof (v as CustomDesignSystem).name === "string" &&
        typeof (v as CustomDesignSystem).markdown === "string",
    )
    .slice(0, MAX_SYSTEMS);
}

export const useCustomDesignSystemsStore = create<State>()(
  persist(
    (set, get) => ({
      systems: [],
      add: (name, markdown) => {
        const trimmed = name.trim() || "Imported system";
        const id = `${CUSTOM_SYSTEM_PREFIX}${slugifyName(trimmed)}`;
        const system = { id, name: trimmed, markdown };
        set({ systems: [...get().systems.filter((s) => s.id !== id), system].slice(-MAX_SYSTEMS) });
        return system;
      },
      remove: (id) => set({ systems: get().systems.filter((s) => s.id !== id) }),
    }),
    {
      name: CUSTOM_DESIGN_SYSTEMS_KEY,
      version: 1,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ systems: state.systems }),
      merge: (persisted, current) => ({
        ...current,
        systems: sanitizeCustomSystems((persisted as { systems?: unknown } | undefined)?.systems),
      }),
    },
  ),
);
