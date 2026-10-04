import { describe, expect, it } from "vitest";

import {
  HISTORY_CAP,
  historyPath,
  overflowPaths,
  parseHistory,
  shouldSnapshot,
} from "./history.logic";

describe("history", () => {
  it("builds sortable paths", () => {
    const p = historyPath(new Date("2026-10-04T10:15:00.123Z"));
    expect(p).toBe("design/.history/20261004T101500123.html");
  });
  it("lists newest first and caps at 30", () => {
    const entries = Array.from({ length: 35 }, (_, i) => ({
      path: `design/.history/20261004T1015${String(i).padStart(2, "0")}000.html`,
      kind: "file",
    }));
    entries.push({ path: "design/.history/notes.txt", kind: "file" });
    const list = parseHistory(entries);
    expect(list).toHaveLength(HISTORY_CAP);
    expect(list[0]!.path).toContain("101534000");
    expect(list[0]!.label).toBe("2026-10-04 10:15:34");
    expect(overflowPaths(entries.slice(0, 35).map((e) => e.path))).toHaveLength(5);
  });
  it("skips empty or duplicate snapshots", () => {
    expect(shouldSnapshot(null, null)).toBe(false);
    expect(shouldSnapshot("a", "a")).toBe(false);
    expect(shouldSnapshot("b", "a")).toBe(true);
  });
});
