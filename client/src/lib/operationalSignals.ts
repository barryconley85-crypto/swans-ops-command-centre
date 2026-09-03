// Operational shifts are intentionally not treated as alert gaps: staffing
// varies by day, especially weekends and planned leave. On-call cover is the
// only rota requirement that should create an exception.
const requiredCover = ["on_call"];

export function buildOperationalSignals(state: any, workDate: string) {
  const rota = (state.rota || []).filter((item: any) => item.workDate === workDate);
  const uncoveredDuties = requiredCover.filter(type => !rota.some((item: any) => item.assignmentType === type));
  const unownedTasks = (state.tasks || []).filter((task: any) => task.workDate === workDate && task.status !== "complete" && !task.assignedTeamMemberId);
  const openHelpRequests = (state.helpRequests || []).filter((request: any) => request.status !== "resolved");
  const unownedHelpRequests = openHelpRequests.filter((request: any) => !request.ownerTeamMemberId);
  return { uncoveredDuties, unownedTasks, openHelpRequests, unownedHelpRequests, total: uncoveredDuties.length + unownedTasks.length + unownedHelpRequests.length };
}
