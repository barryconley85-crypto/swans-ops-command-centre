const requiredCover = ["early", "core", "late", "on_call"];

export function buildOperationalSignals(state: any, activeMembers: any[], workDate: string) {
  const rota = (state.rota || []).filter((item: any) => item.workDate === workDate);
  const uncoveredDuties = requiredCover.filter(type => !rota.some((item: any) => item.assignmentType === type));
  const unownedTasks = (state.tasks || []).filter((task: any) => task.workDate === workDate && task.status !== "complete" && !task.assignedTeamMemberId);
  const openHelpRequests = (state.helpRequests || []).filter((request: any) => request.status !== "resolved");
  const unownedHelpRequests = openHelpRequests.filter((request: any) => !request.ownerTeamMemberId);
  const readiness = (state.readiness || []).filter((pulse: any) => pulse.pulseDate === workDate);
  const missingReadiness = Math.max(0, activeMembers.length - new Set(readiness.map((pulse: any) => pulse.teamMemberId)).size);
  return { uncoveredDuties, unownedTasks, openHelpRequests, unownedHelpRequests, missingReadiness, total: uncoveredDuties.length + unownedTasks.length + unownedHelpRequests.length + missingReadiness };
}
