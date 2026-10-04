import { Download } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";

import { exportPdf, exportPptx, exportZip } from "./exportActions";

/** "Export" dropdown: HTML / ZIP / PDF / PPTX (text-only slides). */
export function ExportMenu(props: {
  html: string | null;
  file: string;
  designMd: () => Promise<string | null>;
  onExportHtml: () => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const disabled = props.html === null;
  return (
    <Menu>
      <MenuTrigger
        render={<Button size="xs" variant="ghost" disabled={disabled} title={note ?? undefined} />}
      >
        <Download />
        Export
      </MenuTrigger>
      <MenuPopup align="end">
        <MenuItem onClick={props.onExportHtml}>HTML</MenuItem>
        <MenuItem
          onClick={async () => {
            if (props.html === null) return;
            await exportZip({
              file: props.file,
              html: props.html,
              designMd: await props.designMd(),
            });
          }}
        >
          ZIP (HTML + DESIGN.md)
        </MenuItem>
        <MenuItem onClick={() => props.html !== null && exportPdf(props.html)}>
          PDF (print dialog)
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (props.html === null) return;
            setNote(
              exportPptx(props.file, props.html)
                ? null
                : "No slides found (.slide or body > section)",
            );
          }}
        >
          PPTX (slides, text only)
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
