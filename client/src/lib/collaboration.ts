export const standardShiftPatterns = [
  { label: "Early", startTime: "06:00", endTime: "15:00", assignmentType: "early", description: "First service and pre-departure control" },
  { label: "Core", startTime: "07:00", endTime: "16:00", assignmentType: "core", description: "Daytime operating cover" },
  { label: "Late", startTime: "09:00", endTime: "18:00", assignmentType: "late", description: "Afternoon continuity and close-down" },
] as const;

export function buildTaskAssignmentNotification(task: { id?: number | null; assignedEmail: string; title: string }, id: number, createdAt: number) {
  return { id, recipientEmail: task.assignedEmail, kind: "task_assignment", title: "New task assigned", body: task.title, taskId: task.id ?? null, readAt: null, createdAt, updatedAt: createdAt };
}

export type RotaAssignmentForValidation = {
  id?: number;
  workDate: string;
  teamMemberId: number;
  assignmentType: string;
  startTime?: string | null;
  endTime?: string | null;
};

export function hasExactRotaDuplicate(assignments: RotaAssignmentForValidation[], candidate: RotaAssignmentForValidation, ignoredId?: number | null) {
  return assignments.some(assignment => assignment.id !== ignoredId && assignment.workDate === candidate.workDate && assignment.teamMemberId === candidate.teamMemberId && assignment.assignmentType === candidate.assignmentType && (assignment.startTime || null) === (candidate.startTime || null) && (assignment.endTime || null) === (candidate.endTime || null));
}
