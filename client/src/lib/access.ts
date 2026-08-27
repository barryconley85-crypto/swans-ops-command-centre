export type WorkspaceRole = "lead" | "manager" | "coordinator" | "dispatcher" | "on_call" | "viewer" | "support";

const rolesWith = {
  manageOperations: ["lead", "manager"],
  editSharedWork: ["lead", "manager", "coordinator", "dispatcher"],
  useOnCall: ["lead", "manager", "coordinator", "dispatcher", "on_call", "support"],
  submitReadiness: ["lead", "manager", "coordinator", "on_call", "support"],
  chat: ["lead", "manager", "coordinator", "dispatcher", "on_call", "support"],
  reports: ["lead", "manager", "coordinator", "dispatcher", "on_call", "viewer", "support"],
} as const;

export function hasWorkspacePermission(role: WorkspaceRole | undefined | null, permission: keyof typeof rolesWith) {
  return Boolean(role && rolesWith[permission].includes(role as never));
}

export function roleLabel(role: WorkspaceRole | undefined | null) {
  const labels: Record<string, string> = { lead: "Lead / superuser", manager: "Operations manager", coordinator: "Coordinator", dispatcher: "Dispatcher", on_call: "On-call responder", viewer: "Viewer", support: "Coordinator" };
  return labels[role || ""] || "Team member";
}
