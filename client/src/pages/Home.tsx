import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadError } from "@/components/WorkspacePrimitives";
import { trpc } from "@/lib/trpc";
import { compactTime, dateTitle, labelForStatus, localDateKey, priorityStyle } from "@/lib/operations";
import { logFirestoreSnapshot, trackFirestoreListener, useWorkspace } from "@/contexts/WorkspaceContext";
import { firebaseDb } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { AlertTriangle, ArrowRight, Check, ChevronRight, ClipboardCheck, Clock3, Loader2, RadioTower, ShieldCheck, UsersRound, Activity, CalendarDays } from "lucide-react";
import { Link } from "wouter";
import { useEffect, useState } from "react";

export default function Home() {
  const { user } = useAuth();
  const workspace = useWorkspace();
  const [today] = useState(localDateKey());
  const [taskRows, setTaskRows] = useState<any[]>([]);
  const [rotaRows, setRotaRows] = useState<any[]>([]);
  const [tasksLoaded, setTasksLoaded] = useState(false);
  const [rotaLoaded, setRotaLoaded] = useState(false);
  const [dataError, setDataError] = useState<Error | null>(null);
  const [queryVersion, setQueryVersion] = useState(0);
  const [currentHour, setCurrentHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!firebaseDb || !workspace.authUser || !workspace.profile) return;
    setTasksLoaded(false);
    setDataError(null);
    const source = query(collection(firebaseDb, "ops_tasks"), where("workDate", "==", today));
    const detachDiagnostic = trackFirestoreListener("ops_tasks");
    let firstSnapshot = true;
    const unsubscribe = onSnapshot(source, snapshot => {
      logFirestoreSnapshot(firstSnapshot ? "initial-snapshot" : "snapshot-update", "ops_tasks", snapshot);
      firstSnapshot = false;
      setTaskRows(snapshot.docs.map(item => ({ _docId: item.id, ...item.data() })));
      setTasksLoaded(true);
    }, reason => setDataError(reason instanceof Error ? reason : new Error("Unable to load today's command board tasks.")));
    return () => { unsubscribe(); detachDiagnostic(); };
  }, [workspace.authUser?.uid, workspace.profile?.id, today, queryVersion]);

  useEffect(() => {
    if (!firebaseDb || !workspace.authUser || !workspace.profile) return;
    setRotaLoaded(false);
    setDataError(null);
    const source = query(collection(firebaseDb, "ops_rota"), where("workDate", "==", today));
    const detachDiagnostic = trackFirestoreListener("ops_rota");
    let firstSnapshot = true;
    const unsubscribe = onSnapshot(source, snapshot => {
      logFirestoreSnapshot(firstSnapshot ? "initial-snapshot" : "snapshot-update", "ops_rota", snapshot);
      firstSnapshot = false;
      setRotaRows(snapshot.docs.map(item => ({ _docId: item.id, ...item.data() })));
      setRotaLoaded(true);
    }, reason => setDataError(reason instanceof Error ? reason : new Error("Unable to load today's rota cover.")));
    return () => { unsubscribe(); detachDiagnostic(); };
  }, [workspace.authUser?.uid, workspace.profile?.id, today, queryVersion]);

  const dashboard = trpc.operations.dashboard.useQuery({ date: today, taskRows, rotaRows });
  const snapshot = dashboard.data;
  const metrics = snapshot?.metrics;
  const firstName = user?.name?.split(" ")[0] || "there";
  const greeting = currentHour < 12 ? "Good morning" : currentHour < 17 ? "Good afternoon" : "Good evening";
  const onCall = snapshot?.rota.find(item => item.assignmentType === "on_call")?.member;
  const signals = snapshot?.signals;
  const syncOnCallTasks = trpc.operations.onCall.syncTasks.useMutation();
  useEffect(() => { if (user?.canManageOperations && snapshot?.outstandingOnCall?.length) void syncOnCallTasks.mutate({}); }, [user?.canManageOperations, snapshot?.outstandingOnCall?.length]);

  if (dashboard.isError || dataError) return <LoadError message={dataError?.message || "The live command board is temporarily unavailable."} onRetry={() => { setDataError(null); setQueryVersion(value => value + 1); }} />;
  if (dashboard.isLoading || !tasksLoaded || !rotaLoaded) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#28C5C0]" /></div>;

  const completion = metrics?.totalTasks ? Math.round(((metrics.completeCount ?? 0) / metrics.totalTasks) * 100) : 0;
  const openExceptions = (metrics?.blockedCount ?? 0) + (snapshot?.issues.length ?? 0);

  return <div className="mx-auto max-w-[1600px] space-y-6 pb-12">
    <section className="relative overflow-hidden rounded-[28px] bg-[#102638] px-6 py-7 text-white shadow-[0_24px_60px_-28px_rgba(10,35,54,0.7)] md:px-9 md:py-9">
      <div className="pointer-events-none absolute -right-16 -top-28 h-80 w-80 rounded-full border-[42px] border-[#2CC6C0]/10" />
      <div className="pointer-events-none absolute right-24 top-20 h-44 w-44 rounded-full bg-[#2CC6C0]/10 blur-3xl" />
      <div className="relative flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#9FC4D8]"><span className="h-2 w-2 rounded-full bg-[#35D0C4] shadow-[0_0_0_5px_rgba(53,208,196,0.12)]" /> Operations command centre <span className="text-white/30">/</span> {dateTitle(today)}</div>
          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.045em] md:text-[42px]">{greeting}, {firstName}.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#C1D4E0]">Your live operating picture, the actions that need attention and the people keeping the day moving.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/exceptions"><Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">Live operations <Activity className="ml-2 h-4 w-4" /></Button></Link>
          <Link href="/tasks"><Button variant="outline" className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">Task board <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
          <Link href="/handover"><Button className="bg-[#2CC6C0] font-semibold text-[#082A38] hover:bg-[#54D8D0]">Log a handover</Button></Link>
        </div>
      </div>
      <div className="relative mt-8 grid grid-cols-2 gap-3 border-t border-white/10 pt-5 md:grid-cols-4">
        <HeroStat label="Daily completion" value={metrics?.totalTasks ? `${completion}%` : "—"} detail={metrics?.totalTasks ? `${metrics.completeCount ?? 0} / ${metrics.totalTasks} tasks` : "No tasks created"} />
        <HeroStat label="Needs attention" value={metrics?.overdueCount ?? 0} detail="Overdue tasks" alert={(metrics?.overdueCount ?? 0) > 0} />
        <HeroStat label="Open exceptions" value={openExceptions} detail="Blocked tasks and issue log" alert={openExceptions > 0} />
        <HeroStat label="On-call cover" value={onCall ? "Covered" : "Missing"} detail={onCall?.displayName || "No lead assigned"} alert={!onCall} />
      </div>
    </section>

    {user?.isSuperuser && signals ? <OperationalSignals signals={signals} /> : null}

    {!snapshot?.members.length ? <OnboardingPanel /> : <>
      {snapshot?.outstandingOnCall?.length ? <section className="overflow-hidden rounded-2xl border border-[#E9CDAF] bg-[#FFF9F2]"><div className="flex flex-col gap-2 border-b border-[#F0E0CE] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-bold text-[#694B2D]">Outstanding on-call actions</h2><p className="mt-1 text-xs text-[#8B745B]">Follow-ups from any date that still need closing.</p></div><Link href="/on-call" className="text-xs font-bold text-[#98642C] hover:underline">Open on-call board <ArrowRight className="ml-1 inline h-3 w-3" /></Link></div><div className="divide-y divide-[#F0E0CE]">{snapshot.outstandingOnCall.slice(0, 5).map((item: any) => <div key={item.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge className={`border-0 px-2 py-0.5 text-[9px] uppercase tracking-wider ${priorityStyle[item.priority]}`}>{item.priority}</Badge><span className="text-[10px] font-semibold text-[#96785A]">{item.workDate}</span></div><p className="mt-1 text-sm font-semibold text-[#493A2B]">{item.title}</p><p className="mt-0.5 line-clamp-1 text-xs text-[#856F58]">{item.nextAction || item.detail}</p></div><span className="text-xs font-semibold text-[#6C5845]">{item.owner?.displayName || "On-call"}</span></div>)}</div></section> : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
        <div className="overflow-hidden rounded-2xl border border-[#D8E5ED] bg-white shadow-[0_12px_34px_-28px_rgba(16,38,56,0.55)]">
          <div className="flex items-center justify-between border-b border-[#E8EFF4] px-5 py-4"><div><div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#168F95]">Priority queue</div><h2 className="mt-1 text-lg font-semibold tracking-tight text-[#142F42]">Today’s command board</h2><p className="mt-1 text-xs text-[#718595]">The work that needs to move today.</p></div><Link href="/tasks" className="text-xs font-bold text-[#168F95] hover:underline">All tasks <ArrowRight className="ml-1 inline h-3 w-3" /></Link></div>
          <div>{snapshot.tasks.length ? snapshot.tasks.slice(0, 7).map((task, index) => <div key={task.id} className="group flex items-center gap-3 border-b border-[#EDF2F6] px-5 py-4 last:border-0 hover:bg-[#F7FBFD]"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${task.status === "complete" ? "bg-[#E7F5EF] text-[#287A59]" : "bg-[#EAF2F8] text-[#42657B]"}`}>{task.status === "complete" ? <Check className="h-4 w-4" /> : String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#20394B]">{task.title}</p><div className="mt-1.5 flex flex-wrap items-center gap-2"><Badge className={`border-0 px-2 py-0.5 text-[9px] uppercase tracking-wider ${priorityStyle[task.priority]}`}>{task.priority}</Badge><span className="text-[11px] text-[#718595]">{task.member?.displayName || "Unassigned"}</span></div></div><div className="shrink-0 text-right"><p className={`text-xs font-bold ${task.dueAt && task.dueAt < Date.now() && task.status !== "complete" ? "text-[#C0443A]" : "text-[#526D80]"}`}>{compactTime(task.dueAt)}</p><p className="mt-1 text-[10px] text-[#8294A1]">{labelForStatus(task.status)}</p></div><ChevronRight className="h-4 w-4 text-[#B7C7D1] transition group-hover:translate-x-0.5 group-hover:text-[#168F95]" /></div>) : <BoardEmpty />}</div>
        </div>

        <aside className="space-y-5">
          <div className="relative overflow-hidden rounded-2xl bg-[#17364B] p-5 text-white shadow-[0_16px_36px_-24px_rgba(16,38,56,0.7)]"><div className="absolute -right-8 -top-8 h-32 w-32 rounded-full border-[18px] border-[#2CC6C0]/10" /><div className="relative flex items-center justify-between"><div className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#A8C9D9]">Duty leadership</div><RadioTower className="h-5 w-5 text-[#45D0C8]" /></div><p className="relative mt-6 text-[26px] font-semibold tracking-tight">{onCall?.displayName || "Not assigned"}</p><p className="relative mt-1 text-xs text-[#C3D7E2]">{onCall ? "Named lead for out-of-hours continuity." : "Assign a lead to maintain cover."}</p><Link href="/rota"><Button variant="ghost" className="relative mt-5 h-9 bg-white/10 px-3 text-xs text-white hover:bg-white/15 hover:text-white">Review weekly rota <ChevronRight className="ml-1 h-3.5 w-3.5" /></Button></Link></div>
          <div className="rounded-2xl border border-[#D8E5ED] bg-white p-5 shadow-[0_12px_34px_-28px_rgba(16,38,56,0.55)]"><div className="flex items-center justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#168F95]">Shift continuity</div><h2 className="mt-1 text-base font-semibold text-[#193448]">Handover & issues</h2></div><ShieldCheck className="h-5 w-5 text-[#168F95]" /></div><div className="mt-4 grid grid-cols-2 gap-3"><SignalStat label="Handovers" value={snapshot?.handovers.length ?? 0} className="bg-[#EAF4F8] text-[#315D75]" /><SignalStat label="Issues" value={snapshot?.issues.length ?? 0} className="bg-[#FFF1EA] text-[#A94E3E]" /></div><div className="mt-4 grid grid-cols-2 gap-2"><Link href="/handover"><Button variant="outline" size="sm" className="w-full border-[#D5E1E9] text-xs">Handovers</Button></Link><Link href="/issues"><Button variant="outline" size="sm" className="w-full border-[#D5E1E9] text-xs">Issue log</Button></Link></div></div>
        </aside>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <DataPanel title="Live handovers" eyebrow="Shift-to-shift continuity" href="/handover" action="Open register" icon={<ShieldCheck className="h-4 w-4" />} empty="No open handovers have been recorded.">{snapshot.handovers.slice(0, 4).map(handover => <div key={handover.id} className="flex items-start gap-3 px-5 py-4"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${handover.priority === "critical" ? "bg-[#C84D3B]" : handover.priority === "high" ? "bg-[#DD9B39]" : "bg-[#2CA89E]"}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#20394B]">{handover.title}</p><p className="mt-1 line-clamp-1 text-xs text-[#718595]">{handover.detail}</p></div><span className="text-[11px] font-bold text-[#60798A]">{handover.member?.initials || "—"}</span></div>)}</DataPanel>
        <DataPanel title="Operational exceptions" eyebrow="Risks requiring a next action" href="/issues" action="Issue log" icon={<AlertTriangle className="h-4 w-4" />} empty="No active issues have been recorded.">{snapshot.issues.slice(0, 4).map(issue => <div key={issue.id} className="flex items-start gap-3 px-5 py-4"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${issue.impact === "critical" || issue.impact === "high" ? "bg-[#C84D3B]" : "bg-[#DD9B39]"}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-[#20394B]">{issue.title}</p><p className="mt-1 line-clamp-1 text-xs text-[#718595]">Next: {issue.nextAction}</p></div><span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-[#718595]">{issue.category.replace("_", " ")}</span></div>)}</DataPanel>
      </section>
    </>}
  </div>;
}

function HeroStat({ label, value, detail, alert = false }: { label: string; value: string | number; detail: string; alert?: boolean }) { return <div className="border-l border-white/10 pl-4 first:border-0 first:pl-0"><p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#A9C5D5]">{label}</p><p className={`mt-1.5 text-2xl font-semibold tracking-tight ${alert ? "text-[#FFD09A]" : "text-white"}`}>{value}</p><p className="mt-0.5 text-[10px] text-[#B7CCD9]">{detail}</p></div>; }
function SignalStat({ label, value, className }: { label: string; value: number; className: string }) { return <div className={`rounded-xl px-2 py-3 text-center ${className}`}><p className="text-xl font-semibold">{value}</p><p className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.08em] opacity-75">{label}</p></div>; }
function DataPanel({ title, eyebrow, href, action, icon, empty, children }: { title: string; eyebrow: string; href: string; action: string; icon: React.ReactNode; empty: string; children: React.ReactNode }) { return <div className="overflow-hidden rounded-2xl border border-[#D8E5ED] bg-white shadow-[0_12px_34px_-28px_rgba(16,38,56,0.55)]"><div className="flex items-center justify-between border-b border-[#E8EFF4] px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF4F8] text-[#168F95]">{icon}</span><div><p className="text-[9px] font-bold uppercase tracking-[0.13em] text-[#168F95]">{eyebrow}</p><h2 className="mt-0.5 text-sm font-semibold text-[#193448]">{title}</h2></div></div><Link href={href} className="text-xs font-bold text-[#168F95] hover:underline">{action}</Link></div><div className="divide-y divide-[#EDF2F6]">{children || <p className="px-5 py-8 text-center text-xs text-[#7C8F9C]">{empty}</p>}</div></div>; }
function BoardEmpty() { return <div className="px-6 py-12 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#EAF4F8] text-[#168F95]"><ClipboardCheck className="h-5 w-5" /></span><p className="mt-3 text-sm font-semibold text-[#20394B]">No tasks on today’s board yet.</p><Link href="/tasks" className="mt-2 inline-block text-xs font-bold text-[#168F95] hover:underline">Create a daily checklist</Link></div>; }
function OnboardingPanel() { return <section className="mt-7 overflow-hidden rounded-3xl bg-[#102638] px-6 py-10 text-white md:px-10"><div className="max-w-2xl"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10"><UsersRound className="h-5 w-5 text-[#BFE5E9]" /></div><p className="mt-6 text-[10px] font-bold uppercase tracking-[0.17em] text-[#9FC4D8]">Set up your command centre</p><h2 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Start with the people who make the operation run.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-[#C1D4E0]">Create the team, then add the daily checks and rota routines you already use.</p><Link href="/people"><Button className="mt-6 bg-[#2CC6C0] font-semibold text-[#082A38] hover:bg-[#54D8D0]">Create the team <ArrowRight className="ml-2 h-4 w-4" /></Button></Link></div></section>; }
function OperationalSignals({ signals }: { signals: any }) { const prompts = [signals.uncoveredDuties.length ? `${signals.uncoveredDuties.map((duty: string) => duty.replace("_", " ")).join(", ")} cover missing` : null, signals.unownedTasks.length ? `${signals.unownedTasks.length} unowned task${signals.unownedTasks.length === 1 ? "" : "s"}` : null, signals.unownedHelpRequests.length ? `${signals.unownedHelpRequests.length} help request${signals.unownedHelpRequests.length === 1 ? "" : "s"} waiting for an owner` : null].filter(Boolean); if (!prompts.length) return <section className="flex items-center gap-3 rounded-2xl border border-[#CBE5DA] bg-[#F4FBF8] px-5 py-3.5 text-sm text-[#34745B]"><Check className="h-4 w-4" />Operational signals are complete for the information recorded today.</section>; return <section className="flex flex-col gap-3 rounded-2xl border border-[#E9CDAF] bg-[#FFF9F2] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#AD6A27]" /><div><p className="text-sm font-semibold text-[#694B2D]">Operational signals to close</p><p className="mt-1 text-xs leading-5 text-[#79654B]">{prompts.join(" · ")}. These are missing operational inputs, not a staff performance score.</p></div></div><Link href="/help"><Button size="sm" variant="outline" className="shrink-0 border-[#E6CDAE] bg-white text-[#7B5326]">Coordinate help</Button></Link></section>; }
