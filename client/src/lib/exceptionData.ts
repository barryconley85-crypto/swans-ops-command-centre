const activeTaskStatuses = new Set(["pending", "in_progress", "blocked", "missed"]);

export function activeExceptionTasks<T extends {
  workDate?: string;
  status?: string;
  isPersonal?: boolean;
  personalOwnerUserId?: string | null;
  createdByUserId?: string | null;
}>(rows: T[], workDate: string, userId: string | null, isLead: boolean) {
  return rows.filter(row =>
    activeTaskStatuses.has(row.status || "") &&
    Boolean(row.workDate) &&
    row.workDate! <= workDate &&
    (!row.isPersonal || isLead || Boolean(userId && (row.personalOwnerUserId === userId || row.createdByUserId === userId)))
  );
}

export function rotaForExceptionDate<T extends { workDate?: string }>(rows: T[], workDate: string) {
  return rows.filter(row => row.workDate === workDate);
}
