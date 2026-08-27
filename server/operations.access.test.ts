import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const mockedDb = vi.hoisted(() => ({
  resolveTeamMemberForUser: vi.fn(),
  updateDailyTaskStatus: vi.fn(),
}));

vi.mock("./db", () => mockedDb);

import { operationsRouter } from "./routers/operations";

function context(role: "admin" | "user"): TrpcContext {
  return {
    user: {
      id: 9,
      openId: "test-user",
      name: "Test User",
      email: "test@swans.example",
      loginMethod: "manus",
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("operations access rules", () => {
  it("rejects management controls for non-admin users before any database write", async () => {
    const caller = operationsRouter.createCaller(context("user"));

    await expect(caller.team.create({
      displayName: "Alex Morgan",
      email: "alex@swans.example",
      jobTitle: "Operations Coordinator",
      memberRole: "coordinator",
      initials: "AM",
      colour: "#1D5C63",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("derives task activity attribution from the authenticated profile and ignores a client-supplied identity", async () => {
    mockedDb.resolveTeamMemberForUser.mockResolvedValue({ id: 42, displayName: "Alex Morgan", appUserId: 9, status: "active" });
    mockedDb.updateDailyTaskStatus.mockResolvedValue({ success: true });
    const caller = operationsRouter.createCaller(context("user"));

    await caller.tasks.updateStatus({ taskId: 33, status: "complete", actorTeamMemberId: 999 } as never);

    expect(mockedDb.updateDailyTaskStatus).toHaveBeenCalledWith({
      taskId: 33,
      status: "complete",
      actorTeamMemberId: 42,
      actorUserId: 9,
    });
  });
});
