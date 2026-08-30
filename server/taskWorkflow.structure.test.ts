import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tasksSource = readFileSync(new URL("../client/src/pages/Tasks.tsx", import.meta.url), "utf8");
const rotaSource = readFileSync(new URL("../client/src/pages/Rota.tsx", import.meta.url), "utf8");

describe("bulk operations workflow surface", () => {
  it("keeps the task run controls visible in the Tasks page", () => {
    expect(tasksSource).toContain("Apply checklist to a date range");
    expect(tasksSource).toContain("Team can complete");
    expect(tasksSource).toContain("Lead only");
    expect(tasksSource).toContain("Remove");
    expect(tasksSource).toContain("Existing tasks are not overwritten");
  });

  it("keeps rolling-rota range and week-copy controls in the Rota page", () => {
    expect(rotaSource).toContain("Copy to next week");
    expect(rotaSource).toContain("startDate");
    expect(rotaSource).toContain("endDate");
    expect(rotaSource).toContain("Copy to next week");
  });
});
