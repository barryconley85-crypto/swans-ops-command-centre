const dutyLabels: Record<string, string> = { early: "Early · 06:00–15:00", core: "Core · 07:00–16:00", late: "Late · 09:00–18:00", on_call: "On-call", holiday: "Holiday", leave: "Leave", unavailable: "Unavailable" };

export function buildMyShiftSnapshot(state: any, profile: any, workDate: string) {
  const profileId = profile?.id;
  const assignments = (state.rota || []).filter((item: any) => item.workDate === workDate && item.teamMemberId === profileId);
  const assignment = assignments.find((item: any) => ["early", "core", "late", "on_call"].includes(item.assignmentType)) || assignments[0] || null;
  const assignedTasks = (state.tasks || []).filter((task: any) => task.workDate === workDate && task.assignedTeamMemberId === profileId);
  const openTasks = assignedTasks.filter((task: any) => task.status !== "complete");
  const priorityIssues = (state.issues || []).filter((issue: any) => ["open", "monitoring"].includes(issue.status)).sort((a: any, b: any) => {
    const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (rank[a.impact] ?? 2) - (rank[b.impact] ?? 2) || (b.detectedAt || 0) - (a.detectedAt || 0);
  });
  const relevantHandovers = (state.handovers || []).filter((handover: any) => handover.status !== "resolved" && (handover.ownerTeamMemberId === profileId || handover.priority === "critical" || handover.priority === "high"));
  const myHelpRequests = (state.helpRequests || []).filter((request: any) => request.status !== "resolved" && (request.requestedByTeamMemberId === profileId || request.ownerTeamMemberId === profileId));
  return { assignment: assignment ? { ...assignment, label: dutyLabels[assignment.assignmentType] || "Duty" } : null, assignedTasks, openTasks, priorityIssues, relevantHandovers, myHelpRequests, hasUnfinishedWork: openTasks.length > 0 || priorityIssues.length > 0 || relevantHandovers.length > 0 || myHelpRequests.length > 0 };
}
