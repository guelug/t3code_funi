import { History, Undo2 } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";

import type { HistoryEntry } from "./history.logic";

export function HistoryMenu(props: {
  readonly snapshots: readonly HistoryEntry[];
  readonly onUndo: () => void;
  readonly onRestore: (path: string) => void;
}) {
  const empty = props.snapshots.length === 0;
  return (
    <>
      <Button
        size="icon-xs"
        variant="ghost-muted"
        aria-label="Undo last change"
        disabled={empty}
        onClick={props.onUndo}
      >
        <Undo2 />
      </Button>
      <Menu>
        <MenuTrigger
          render={
            <Button
              size="icon-xs"
              variant="ghost-muted"
              aria-label="Version history"
              disabled={empty}
            />
          }
        >
          <History />
        </MenuTrigger>
        <MenuPopup align="end" className="max-h-80 overflow-y-auto">
          {props.snapshots.map((entry) => (
            <MenuItem key={entry.path} onClick={() => props.onRestore(entry.path)}>
              Restore {entry.label}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
    </>
  );
}
