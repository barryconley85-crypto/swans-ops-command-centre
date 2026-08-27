export type EndOfDayTask = {
  title: string;
  status: "pending" | "in_progress" | "blocked" | "complete";
  assignedName?: string | null;
  completedByName?: string | null;
  completedAt?: number | null;
  blockedReason?: string | null;
};

const time = (value?: number | null) => value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) : "time not recorded";

export function buildEndOfDayReport(dateLabel: string, tasks: EndOfDayTask[]) {
  const completed = tasks.filter(task => task.status === "complete");
  const outstanding = tasks.filter(task => task.status !== "complete");
  const completedLines = completed.length ? completed.map(task => `• ${task.title} — completed by ${task.completedByName || "team member"} at ${time(task.completedAt)}`).join("\n") : "• No tasks were completed.";
  const outstandingLines = outstanding.length ? outstanding.map(task => `• ${task.title} — ${task.status.replace("_", " ")}; owner: ${task.assignedName || "unassigned"}${task.blockedReason ? `; blocker: ${task.blockedReason}` : ""}`).join("\n") : "• No outstanding tasks.";
  return { subject: `Swans Ops end-of-day report — ${dateLabel}`, text: `SWANS OPERATIONS COMMAND CENTRE\nEND-OF-DAY REPORT\n${dateLabel}\n\nCOMPLETED (${completed.length})\n${completedLines}\n\nOUTSTANDING (${outstanding.length})\n${outstandingLines}\n\nOpen the Operations Command Centre for task activity and supporting notes.` };
}
