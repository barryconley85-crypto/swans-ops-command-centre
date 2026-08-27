export const standardShiftPatterns = [
  { label: "Early", startTime: "06:00", endTime: "15:00", assignmentType: "early", description: "First service and pre-departure control" },
  { label: "Core", startTime: "07:00", endTime: "16:00", assignmentType: "core", description: "Daytime operating cover" },
  { label: "Late", startTime: "09:00", endTime: "18:00", assignmentType: "late", description: "Afternoon continuity and close-down" },
] as const;

export function buildTaskAssignmentNotification(task: { id?: number | null; assignedEmail: string; title: string }, id: number, createdAt: number) {
  return { id, recipientEmail: task.assignedEmail, kind: "task_assignment", title: "New task assigned", body: task.title, taskId: task.id ?? null, readAt: null, createdAt, updatedAt: createdAt };
}
