export const auditableCollections: Record<string, string> = {
  members: "team member",
  tasks: "task",
  templates: "task template",
  rota: "rota assignment",
  handovers: "handover",
  issues: "issue",
  readiness: "readiness pulse",
  notes: "team note",
  chatMessages: "chat message",
  onCallItems: "on-call item",
  helpRequests: "help or cover request",
  shiftPrompts: "shift check",
  reportViews: "saved report view",
};

export function activitySummary(action: "created" | "updated" | "deleted", collectionName: string, value: Record<string, unknown> = {}) {
  const type = auditableCollections[collectionName] || collectionName;
  const label = String(value.title || value.displayName || value.name || value.workDate || value.pulseDate || "record").trim();
  return `${action[0].toUpperCase()}${action.slice(1)} ${type}${label ? `: ${label.slice(0, 120)}` : ""}`;
}

export function activityLabel(action: string) {
  return action === "signed_in" ? "Signed in" : action === "created" ? "Created" : action === "updated" ? "Updated" : action === "deleted" ? "Deleted" : "Activity";
}
