import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadError } from "@/components/WorkspacePrimitives";
import { trpc } from "@/lib/trpc";
import { compactTime, dateTitle, localDateKey, priorityStyle } from "@/lib/operations";
import { addDays } from "date-fns";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, CircleAlert, Clock3, HelpCircle, Inbox, RefreshCw, ShieldAlert, UsersRound, Waypoints } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useMemo, useState } from "react";

const exceptionStyle = {
  critical: "border-[#F0C9C3] bg-[#FFF1EF] text-[#A84237]",
  high: "border-[#F2D8B5] bg-[#FFF8EC] text-[#A76624]",
  normal: "border-[#DCE6E0] bg-[#F5FAF7] text-[#39705F]",
};

type Exception = {
  id: string;
  kind: "Blocked" | "Overdue" | "Unassigned" | "Due soon" | "Cover gap" | "Issue" | "Handover" | "Help request";
  title: string;
  detail: string;
  owner: string;
  priority: "critical" | "high" | "normal";
  href: string;
  action: string;
};

export default function Exceptions() {
  const { user } = useAuth();
  const [selectedDate, setSelectedDate] = useState(localDateKey());
  const [now, setNow] = useState(Date.now());
  const dashboard = trpc.operations.dashboard.useQuery({ date: selectedDate });
  const snapshot = dashboard.data;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const exceptions = useMemo<Exception[]>(() => {
    if (!snapshot) return [];
    const result: Exception[] = [];
    const tasks = snapshot.tasks.filter((task: any) => task.status !== "complete");
    tasks.forEach((task: any) => {
      const overdue = Boolean(task.dueAt && task.dueAt < now);
      const dueSoon = Boolean(task.dueAt && task.dueAt >= now && task.dueAt <= now + 2 * 60 * 60 * 1000);
      const blocked = task.status === "blocked";
      const unassigned = !task.assignedTeamMemberId;
      if (!blocked && !overdue && !unassigned && !dueSoon) return;
      const kind: Exception["kind"] = blocked ? "Blocked" : overdue ? "Overdue" : unassigned ? "Unassigned" : "Due soon";
      const priority: Exception["priority"] = blocked || task.priority === "critical" ? "critical" : overdue || task.priority === "high" ? "high" : "normal";
      result.push({ id: `task-${task.id}`, kind, title: task.title, detail: blocked ? task.blockedReason || "The task has been marked as blocked." : overdue ? `Due ${compactTime(task.dueAt)} and still open.` : unassigned ? "No staff member has been made responsible." : `Due at ${compactTime(task.dueAt)}.`, owner: task.member?.displayName || "No owner", priority, href: "/tasks", action: "Open task" });
    });
    (snapshot.signals?.uncoveredDuties || []).forEach((duty: string) => result.push({ id: `cover-${duty}`, kind: "Cover gap", title: `${duty.replace("_", " ")} cover is missing`, detail: "No rota assignment is recorded for this required duty today.", owner: "No cover", priority: "critical", href: "/rota", action: "Review rota" }));
    (snapshot.handovers || []).forEach((handover: any) => result.push({ id: `handover-${handover.id}`, kind: "Handover", title: handover.title, detail: handover.detail || "Open handover waiting to be acknowledged.", owner: handover.member?.displayName || "Unassigned", priority: handover.priority === "critical" ? "critical" : handover.priority === "high" ? "high" : "normal", href: "/handover", action: "Open handover" }));
    (snapshot.issues || []).forEach((issue: any) => result.push({ id: `issue-${issue.id}`, kind: "Issue", title: issue.title, detail: issue.nextAction || "An open operational issue needs a next action.", owner: issue.owner?.displayName || "Unassigned", priority: issue.impact === "critical" ? "critical" : issue.impact === "high" ? "high" : "normal", href: "/issues", action: "Open issue" }));
    (snapshot.signals?.unownedHelpRequests || []).forEach((request: any) => result.push({ id: `help-${request.id}`, kind: "Help request", title: request.title || "Help request needs an owner", detail: request.detail || "A colleague is waiting for operational support.", owner: "Unassigned", priority: request.priority === "critical" ? "critical" : request.priority === "high" ? "high" : "normal", href: "/help", action: "Coordinate help" }));
    const order = { critical: 0, high: 1, normal: 2 };
    return result.sort((a, b) => order[a.priority] - order[b.priority]);
  }, [now, snapshot]);

  const counts = useMemo(() => ({
    total: exceptions.length,
    critical: exceptions.filter(item => item.priority === "critical").length,
    overdue: exceptions.filter(item => item.kind === "Overdue").length,
    unowned: exceptions.filter(item => item.kind === "Unassigned" || item.kind === "Cover gap" || item.kind === "Help request").length,
    blocked: exceptions.filter(item => item.kind === "Blocked").length,
  }), [exceptions]);

  const moveDate = (offset: number) => setSelectedDate(localDateKey(addDays(new Date(`${selectedDate}T12:00:00`), offset)));
  const isToday = selectedDate === localDateKey();

  if (dashboard.isLoading) return <div className="flex min-h-[55vh] items-center justify-center"><RefreshCw className="h-6 w-6 animate-spin text-[#1D5C63]" /></div>;
  if (dashboard.isError) return <LoadError message="The live exceptions board is temporarily unavailable." onRetry={() => void dashboard.refetch()} />;

  return <div className="mx-auto max-w-[1500px] pb-10">
    <header className="flex flex-col gap-5 border-b border-[#E3E9E5] pb-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#71817A]">Control room · {dateTitle(selectedDate)}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#1C2924]">Live exceptions</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#69756F]">The work that needs a decision, an owner, cover, or support before it becomes a service problem.</p></div><div className="flex flex-wrap items-center gap-2"><div className="flex h-10 items-center rounded-xl border border-[#DFE6E1] bg-white p-1 shadow-sm"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveDate(-1)} aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Button><span className="min-w-32 px-3 text-center text-sm font-semibold text-[#34413C]">{isToday ? "Today" : dateTitle(selectedDate)}</span><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveDate(1)} aria-label="Next day"><ChevronRight className="h-4 w-4" /></Button></div><Button variant="outline" className="h-10 border-[#D6E2DE] bg-white" onClick={() => void dashboard.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button><Link href="/tasks"><Button className="h-10 bg-[#1D5C63] hover:bg-[#164B50]">Open task board<ArrowRight className="ml-2 h-4 w-4" /></Button></Link></div></header>

    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5"><Metric label="Needs action" value={counts.total} support={counts.total ? "Live exceptions to close" : "Nothing needs attention"} icon={<AlertTriangle className="h-5 w-5" />} tint="red" /><Metric label="Critical" value={counts.critical} support="Immediate management attention" icon={<ShieldAlert className="h-5 w-5" />} tint="red" /><Metric label="Overdue" value={counts.overdue} support="Open tasks past their due time" icon={<Clock3 className="h-5 w-5" />} tint="amber" /><Metric label="Unowned" value={counts.unowned} support="Work or cover without ownership" icon={<UsersRound className="h-5 w-5" />} tint="amber" /><Metric label="Blocked" value={counts.blocked} support="Named work that cannot progress" icon={<CircleAlert className="h-5 w-5" />} tint="teal" /></section>

    <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]"><div className="overflow-hidden rounded-2xl border border-[#E0E7E2] bg-white shadow-[0_18px_38px_-32px_rgba(18,48,41,0.46)]"><div className="flex flex-col gap-2 border-b border-[#EDF0EE] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-base font-semibold text-[#23312C]">Exceptions requiring action</h2><p className="mt-0.5 text-xs text-[#74817C]">Each row has a named owner, a reason, and a direct route to resolve it.</p></div><span className="text-xs font-semibold text-[#718078]">Updated live</span></div>{exceptions.length ? <div className="divide-y divide-[#F0F2F1]">{exceptions.map(item => <div key={item.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${exceptionStyle[item.priority]}`}>{item.kind === "Handover" ? <Waypoints className="h-4 w-4" /> : item.kind === "Help request" ? <HelpCircle className="h-4 w-4" /> : item.kind === "Cover gap" ? <CalendarDays className="h-4 w-4" /> : item.kind === "Blocked" ? <CircleAlert className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge className={`border-0 px-2 py-0.5 text-[9px] uppercase tracking-[0.08em] ${priorityStyle[item.priority === "normal" ? "normal" : item.priority]}`}>{item.kind}</Badge><p className="truncate text-sm font-semibold text-[#2B3833]">{item.title}</p></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-[#77837D]">{item.detail}</p><p className="mt-1 text-[11px] text-[#7A8580]">Owner: <strong className="font-semibold text-[#58665F]">{item.owner}</strong></p></div><Link href={item.href}><Button variant="outline" size="sm" className="shrink-0 border-[#DCE6E0] text-xs">{item.action}<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button></Link></div>)}</div> : <div className="px-6 py-16 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EAF4EE] text-[#39745D]"><CheckCircle2 className="h-6 w-6" /></span><p className="mt-4 text-sm font-semibold text-[#34413C]">No live exceptions for this day</p><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-[#77837D]">All recorded tasks, cover, handovers, issues, and help requests are either owned, on track, or resolved.</p></div>}</div>
      <aside className="space-y-5"><div className="rounded-2xl bg-[#1C3732] px-5 py-5 text-white shadow-[0_18px_38px_-22px_rgba(18,48,41,0.72)]"><div className="flex items-center justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#B9D3C9]">Manager’s next move</p><Inbox className="h-4 w-4 text-[#B9D3C9]" /></div><p className="mt-5 text-lg font-medium leading-7">Close the oldest exception first, then confirm the owner knows what good looks like.</p><p className="mt-4 border-t border-white/15 pt-4 text-xs leading-5 text-[#C7D8D2]">This view is an operational queue, not a staff performance score.</p></div><div className="rounded-2xl border border-[#E0E7E2] bg-white p-5"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E9F2EF] text-[#397167]"><UsersRound className="h-4 w-4" /></div><div><p className="text-sm font-semibold text-[#28352F]">Ownership rule</p><p className="mt-0.5 text-xs text-[#7A8680]">Every action needs one accountable person.</p></div></div><p className="mt-4 text-xs leading-5 text-[#68766F]">Assign unowned work, record why blocked work cannot progress, and use a handover when responsibility changes between shifts.</p><div className="mt-4 grid gap-2"><Link href="/tasks"><Button variant="outline" size="sm" className="w-full justify-between border-[#DCE6E0] text-xs">Assign task owners<ArrowRight className="h-3.5 w-3.5" /></Button></Link><Link href="/rota"><Button variant="outline" size="sm" className="w-full justify-between border-[#DCE6E0] text-xs">Review cover<ArrowRight className="h-3.5 w-3.5" /></Button></Link></div></div></aside>
    </section>
  </div>;
}

function Metric({ label, value, support, icon, tint }: { label: string; value: number; support: string; icon: React.ReactNode; tint: "teal" | "amber" | "red" }) { const colour = { teal: "bg-[#E9F2EF] text-[#347167]", amber: "bg-[#FFF4E4] text-[#AF6D24]", red: "bg-[#FFF0EE] text-[#B94B3E]" }[tint]; return <div className="rounded-2xl border border-[#E1E8E3] bg-white px-5 py-4 shadow-[0_16px_36px_-32px_rgba(18,48,41,0.46)]"><div className="flex items-start justify-between"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#77847E]">{label}</p><span className={`flex h-8 w-8 items-center justify-center rounded-xl ${colour}`}>{icon}</span></div><p className="mt-4 text-2xl font-semibold tracking-tight text-[#26342F]">{value}</p><p className="mt-1 text-xs text-[#7B8781]">{support}</p></div>; }
