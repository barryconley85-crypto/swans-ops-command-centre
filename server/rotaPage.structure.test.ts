import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rotaPageSource = readFileSync(resolve(process.cwd(), "client/src/pages/Rota.tsx"), "utf8");

describe("Rota & on-call page structure", () => {
  it("removes the oversized cover-guidance panel without removing operational controls", () => {
    expect(rotaPageSource).not.toContain("Cover is a management promise");
    expect(rotaPageSource).not.toContain("Return to current week");
    expect(rotaPageSource).toContain("Add cover");
    expect(rotaPageSource).toContain("On-call gaps");
    expect(rotaPageSource).toContain("Shift coverage");
    expect(rotaPageSource).toContain("Distribution check");
  });
});
