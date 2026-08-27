import { format } from "date-fns";

export type Priority = "low" | "normal" | "high" | "critical";
export type TaskStatus = "pending" | "in_progress" | "blocked" | "complete";

export function localDateKey(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function dateTitle(dateKey: string) {
  return format(new Date(`${dateKey}T12:00:00`), "EEEE, d MMMM");
}

export function compactTime(timestamp?: number | null) {
  return timestamp ? format(new Date(timestamp), "HH:mm") : "No time";
}

export function isoWeekStart(date = new Date()) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  return localDateKey(copy);
}

export const priorityStyle: Record<Priority, string> = {
  low: "bg-slate-100 text-slate-600 ring-slate-200",
  normal: "bg-[#E9F0EE] text-[#35635B] ring-[#D6E3DF]",
  high: "bg-[#FFF2DF] text-[#A25E16] ring-[#F7DEBA]",
  critical: "bg-[#FFE7E4] text-[#B94336] ring-[#F6CAC4]",
};

export const statusStyle: Record<TaskStatus, string> = {
  pending: "bg-[#EEF0EE] text-[#5D6764]",
  in_progress: "bg-[#E6F0F4] text-[#31718A]",
  blocked: "bg-[#FFE7E4] text-[#B94336]",
  complete: "bg-[#E6F2EC] text-[#28714F]",
};

export function labelForStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}
