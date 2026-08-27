import { useWorkspace } from "@/contexts/WorkspaceContext";
import { hasWorkspacePermission, roleLabel, type WorkspaceRole } from "@/lib/access";

export function useAuth() {
  const workspace = useWorkspace();
  const workspaceRole = workspace.profile?.memberRole as WorkspaceRole | undefined;
  const user = workspace.authUser && workspace.profile ? { id: workspace.authUser.uid, name: workspace.profile.displayName, email: workspace.profile.email, role: workspaceRole === "lead" ? "admin" as const : "user" as const, workspaceRole, roleLabel: roleLabel(workspaceRole), isSuperuser: workspaceRole === "lead", canManageOperations: hasWorkspacePermission(workspaceRole, "manageOperations"), canEditSharedWork: hasWorkspacePermission(workspaceRole, "editSharedWork"), canUseOnCall: hasWorkspacePermission(workspaceRole, "useOnCall"), canRunReports: hasWorkspacePermission(workspaceRole, "reports") } : null;
  return { user, loading: workspace.loading, error: workspace.error, isAuthenticated: Boolean(user), refresh: workspace.refresh, logout: workspace.logout };
}
