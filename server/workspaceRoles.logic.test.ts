import { describe, expect, it } from "vitest";
import { hasWorkspacePermission, roleLabel } from "../client/src/lib/access";

describe("workspace roles", () => {
  it("keeps viewers read-only while allowing the intended operational roles to act", () => {
    expect(hasWorkspacePermission("viewer", "editSharedWork")).toBe(false);
    expect(hasWorkspacePermission("viewer", "useOnCall")).toBe(false);
    expect(hasWorkspacePermission("dispatcher", "editSharedWork")).toBe(true);
    expect(hasWorkspacePermission("on_call", "useOnCall")).toBe(true);
    expect(hasWorkspacePermission("manager", "manageOperations")).toBe(true);
  });
  it("uses clear names for selectable operational access levels", () => {
    expect(roleLabel("dispatcher")).toBe("Dispatcher");
    expect(roleLabel("viewer")).toBe("Viewer");
  });
});
