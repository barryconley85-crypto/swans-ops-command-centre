export type PerformanceTask = {
  assignedTeamMemberId: number | null;
  status: "pending" | "in_progress" | "blocked" | "complete";
  dueAt: number | null;
  completedAt: number | null;
  blockedReason: string | null;
};

export type PerformanceRota = {
  teamMemberId: number;
  assignmentType: "early" | "core" | "late" | "on_call" | "leave" | "unavailable";
};

export function calculateMemberPerformance(memberId: number, tasks: PerformanceTask[], rota: PerformanceRota[]) {
  const owned = tasks.filter(task => task.assignedTeamMemberId === memberId);
  const completed = owned.filter(task => task.status === "complete");
  const timely = completed.filter(task => !task.dueAt || (task.completedAt !== null && task.completedAt <= task.dueAt));
  const blockers = owned.filter(task => task.status === "blocked" && task.blockedReason).map(task => task.blockedReason!);
  const causes = blockers.reduce<Record<string, number>>((summary, reason) => ({ ...summary, [reason]: (summary[reason] ?? 0) + 1 }), {});
  const recurringBlocker = Object.entries(causes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    assignedCount: owned.length,
    completeCount: completed.length,
    completionRate: owned.length ? Math.round((completed.length / owned.length) * 100) : null,
    timelyCount: timely.length,
    timelinessRate: completed.length ? Math.round((timely.length / completed.length) * 100) : null,
    blockedCount: blockers.length,
    recurringBlocker,
    onCallCount: rota.filter(item => item.teamMemberId === memberId && item.assignmentType === "on_call").length,
    shiftCount: rota.filter(item => item.teamMemberId === memberId && ["early", "core", "late"].includes(item.assignmentType)).length,
  };
}

export function countCoverGaps(workDates: string[], assignments: Array<{ workDate: string; assignmentType: PerformanceRota["assignmentType"] }>) {
  return {
    onCallGaps: workDates.filter(date => !assignments.some(item => item.workDate === date && item.assignmentType === "on_call")),
    shiftGaps: workDates.filter(date => !assignments.some(item => item.workDate === date && ["early", "core", "late"].includes(item.assignmentType))),
  };
}
