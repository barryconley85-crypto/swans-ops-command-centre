import { describe, expect, it } from "vitest";
import { isTaskTemplate } from "../client/src/lib/templates";

describe("template types", () => {
  it("keeps rota templates out of the task checklist planner", () => {
    expect(isTaskTemplate({ kind: "rota", name: "Week 1" })).toBe(false);
    expect(isTaskTemplate({ name: "Morning checks" })).toBe(true);
  });
});
