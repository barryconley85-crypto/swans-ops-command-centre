import { describe, expect, it } from "vitest";
import { activityLabel, activitySummary } from "../client/src/lib/auditHistory";

describe("activity history helpers", () => {
  it("labels lifecycle events in plain operational language", () => {
    expect(activityLabel("signed_in")).toBe("Signed in");
    expect(activityLabel("created")).toBe("Created");
    expect(activityLabel("updated")).toBe("Updated");
    expect(activityLabel("deleted")).toBe("Deleted");
  });

  it("creates a concise summary without retaining private form contents", () => {
    expect(activitySummary("created", "tasks", { title: "Confirm departure board", detail: "Private internal note" })).toBe("Created task: Confirm departure board");
    expect(activitySummary("deleted", "rota", {})).toBe("Deleted rota assignment: record");
  });
});
