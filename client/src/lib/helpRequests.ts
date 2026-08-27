export type HelpRequestStatus = "open" | "acknowledged" | "resolved";

export function buildHelpRequest(input: any, requester: any, id: number, createdAt: number) {
  const title = String(input.title || "").trim();
  const detail = String(input.detail || "").trim();
  if (!title || !detail) throw new Error("Add a short headline and enough detail for a colleague to help.");
  if (!requester?.id || !requester?.userId) throw new Error("Your work profile is required before requesting support.");
  return { id, requestType: input.requestType === "cover" ? "cover" : "help", priority: ["low", "normal", "high", "critical"].includes(input.priority) ? input.priority : "normal", title: title.slice(0, 160), detail: detail.slice(0, 1_500), workDate: input.workDate || null, requestedDuty: input.requestedDuty || null, requestedByTeamMemberId: requester.id, requestedByName: requester.displayName, requestedByUserId: requester.userId, ownerTeamMemberId: null, status: "open" as HelpRequestStatus, acknowledgedAt: null, resolvedAt: null, resolution: null, createdAt };
}

export function canResolveHelpRequest(request: any, profile: any, canManageOperations: boolean) {
  return Boolean(profile && request && (canManageOperations || request.requestedByTeamMemberId === profile.id || request.ownerTeamMemberId === profile.id));
}
