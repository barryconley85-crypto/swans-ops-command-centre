import { useWorkspace } from "@/contexts/WorkspaceContext";

export function useAuth() {
  const workspace = useWorkspace();
  const user = workspace.authUser && workspace.profile ? { id: workspace.authUser.uid, name: workspace.profile.displayName, email: workspace.profile.email, role: workspace.profile.memberRole === "lead" ? "admin" as const : "user" as const } : null;
  return { user, loading: workspace.loading, error: workspace.error, isAuthenticated: Boolean(user), refresh: workspace.refresh, logout: workspace.logout };
}
