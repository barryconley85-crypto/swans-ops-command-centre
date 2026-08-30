export function dateKeysBetween(startKey: string, endKey: string) {
  const start = new Date(`${startKey}T12:00:00`);
  const end = new Date(`${endKey}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [] as string[];
  const keys: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    keys.push(cursor.toISOString().slice(0, 10));
  }
  return keys;
}

export function shiftDateKey(dateKey: string, dayOffset: number) {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

export function shiftWeekAssignments<T extends { workDate: string }>(assignments: T[], dayOffset = 7) {
  return assignments.map(assignment => ({ ...assignment, workDate: shiftDateKey(assignment.workDate, dayOffset) }));
}
