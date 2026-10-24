import { useWorkspace } from "@/contexts/WorkspaceContext";
import { PageHeader, Panel, PanelHeading, EmptyState, LoadError } from "@/components/WorkspacePrimitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardList, ExternalLink, FileText, Plus, ShieldAlert, Timer, UserRound, Sparkles, MessageSquareWarning } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ComplaintStage = "received" | "investigating" | "decision" | "client_response" | "closed";
type ComplaintTask = { id: string; title: string; owner: string; dueAt: number | null; status: "pending" | "complete" | "waived"; note: string; completedAt?: number; };
type Complaint = { refundAmount?: number; financialStatus?: string; financialNote?: string; _docId: string; id: number; reference: string; title: string; client: string; clientEmail: string; receivedAt: number; category: string; stage: ComplaintStage; summary: string; driverId: string; driverName: string; vehicle: string; serviceDate: string; serviceDetails: string; sharePointUrl: string; acknowledgementDueAt: number; responseDueAt: number; acknowledgedAt: number | null; acknowledgementNote: string; investigationFindings: string; decision: string; clientResponse: string; outcome: string; rootCause: string; ownerTeamMemberId: number | null; tasks: ComplaintTask[]; acknowledgementAlertedAt?: number | null; responseAlertedAt?: number | null; closedAt?: number | null; createdByName: string; createdByUserId: string; createdAt: number; updatedAt: number; };
const stages: { value: ComplaintStage; label: string }[] = [{ value: "received", label: "Received" }, { value: "investigating", label: "Investigation" }, { value: "decision", label: "Review & decision" }, { value: "client_response", label: "Client response" }, { value: "closed", label: "Closed" }];
const categories = ["Driver conduct", "Cleanliness", "Breakdown / reliability", "Late running", "Missed journey", "Customer service", "Vehicle condition", "Accessibility", "Other"];
const stageLabel = (stage: ComplaintStage) => stages.find(item => item.value === stage)?.label || stage;
const dateText = (value?: number | null) => value ? new Date(value).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Not recorded";
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;
// England and Wales bank holidays for 2026 and 2027. Extend this list as part of the annual SLA review.
const bankHolidays = new Set(["2026-01-01","2026-04-03","2026-04-06","2026-05-04","2026-05-25","2026-08-31","2026-12-25","2026-12-28","2027-01-01","2027-03-26","2027-03-29","2027-05-03","2027-05-31","2027-08-30","2027-12-27","2027-12-28"]);
const workingMinute = (date: Date) => date.getHours() * 60 + date.getMinutes();
const isWorkingDay = (date: Date) => !isWeekend(date) && !bankHolidays.has(dateKey(date));
function addWorkingHours(startAt: number, hours: number) {
  const date = new Date(startAt);
  let remaining = hours * 60;
  while (remaining > 0) {
    if (!isWorkingDay(date)) { date.setDate(date.getDate() + 1); date.setHours(9, 0, 0, 0); continue; }
    const minute = workingMinute(date);
    if (minute < 540) { date.setHours(9, 0, 0, 0); continue; }
    if (minute >= 1020) { date.setDate(date.getDate() + 1); date.setHours(9, 0, 0, 0); continue; }
    const available = 1020 - workingMinute(date);
    const used = Math.min(remaining, available);
    date.setMinutes(date.getMinutes() + used);
    remaining -= used;
  }
  return date.getTime();
}
function workingMinutesBetween(from: number, to: number) {
  if (to <= from) return 0;
  const cursor = new Date(from); let total = 0;
  cursor.setSeconds(0, 0);
  while (cursor.getTime() < to) {
    if (isWorkingDay(cursor) && workingMinute(cursor) >= 540 && workingMinute(cursor) < 1020) total++;
    cursor.setMinutes(cursor.getMinutes() + 1);
    if (total > 5_000_000) break;
  }
  return total;
}
function countdown(target: number, now: number) {
  const minutes = workingMinutesBetween(now, target);
  const overdueMinutes = workingMinutesBetween(target, now);
  if (now >= target) return overdueMinutes === 0 ? "Due now" : `Overdue ${Math.floor(overdueMinutes / 60)}h ${overdueMinutes % 60}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m left`;
}
const statusTone: Record<string, string> = { received: "bg-[#EAF1FF] text-[#315A9C]", investigating: "bg-[#FFF4E3] text-[#986321]", decision: "bg-[#F0EAFE] text-[#6A4AA1]", client_response: "bg-[#E5F4F2] text-[#216D63]", closed: "bg-[#EAF4EC] text-[#34704B]" };
const defaultTasks = (owner: string, now: number): ComplaintTask[] => [
  { id: `t-${now}-1`, title: "Acknowledge complaint to client", owner, dueAt: addWorkingHours(now, 8), status: "pending", note: "" },
  { id: `t-${now}-2`, title: "Gather evidence and check records", owner, dueAt: addWorkingHours(now, 4), status: "pending", note: "" },
  { id: `t-${now}-3`, title: "Obtain driver / depot account where relevant", owner, dueAt: addWorkingHours(now, 8), status: "pending", note: "" },
  { id: `t-${now}-4`, title: "Record findings and proposed outcome", owner, dueAt: addWorkingHours(now, 12), status: "pending", note: "" },
  { id: `t-${now}-5`, title: "Send full response to client", owner, dueAt: addWorkingHours(now, 16), status: "pending", note: "" },
];
const freshForm = () => ({ title: "", client: "", clientEmail: "", category: "Driver conduct", summary: "", driverId: "", vehicle: "", serviceDate: "", serviceDetails: "", sharePointUrl: "" });

export default function Complaints() {
  const workspace = useWorkspace();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(freshForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("active");
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [taskDraft, setTaskDraft] = useState("");
  const [newTaskOwner, setNewTaskOwner] = useState("");
  const complaints = ((workspace.state.complaints || []) as Complaint[]).filter((item: any) => item.recordType === "complaint");
  const members = (workspace.state.members || []).filter((member: any) => member.status === "active");
  const drivers = (workspace.state.drivers || []).filter((driver: any) => driver.active !== false);
  const ordered = useMemo(() => [...complaints].sort((a, b) => (a.stage === "closed" ? 1 : 0) - (b.stage === "closed" ? 1 : 0) || b.receivedAt - a.receivedAt), [complaints]);
  const visible = ordered.filter(item => filter === "all" || (filter === "active" ? item.stage !== "closed" : filter === "overdue" ? item.stage !== "closed" && (now > item.acknowledgementDueAt && !item.acknowledgedAt || now > item.responseDueAt) : item.stage === filter));
  const selected = complaints.find(item => item._docId === selectedId) || null;
  const openCount = complaints.filter(item => item.stage !== "closed").length;
  const ackOverdue = complaints.filter(item => item.stage !== "closed" && !item.acknowledgedAt && now > item.acknowledgementDueAt).length;
  const responseOverdue = complaints.filter(item => item.stage !== "closed" && !item.clientResponse.trim() && now > item.responseDueAt).length;
  const driverPatterns = useMemo(() => { const counts = new Map<string, number>(); complaints.filter(item => item.driverId && item.stage !== "closed" ? true : Boolean(item.driverId)).forEach(item => counts.set(item.driverId, (counts.get(item.driverId) || 0) + 1)); return [...counts.entries()].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count, name: complaints.find(item => item.driverId === id)?.driverName || id })); }, [complaints]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  // Notify Stephen in-app once an SLA first becomes overdue while the module is active.
  useEffect(() => {
    if (!workspace.profile) return;
    const stephen = members.find((member: any) => /stephen/i.test(member.displayName));
    if (!stephen?.email) return;
    complaints.forEach(item => {
      if (item.stage === "closed") return;
      const ackDue = !item.acknowledgedAt && now > item.acknowledgementDueAt && !item.acknowledgementAlertedAt;
      const responseDue = !item.clientResponse.trim() && now > item.responseDueAt && !item.responseAlertedAt;
      if (!ackDue && !responseDue) return;
      void (async () => {
        try {
          const kind = ackDue ? "acknowledgement" : "full response";
          await workspace.add("notifications", { id: Date.now(), recipientEmail: stephen.email, type: "complaint_overdue", title: `Complaint ${item.reference} overdue`, body: `${item.title}: ${kind} deadline has passed.`, readAt: null });
          await workspace.patch("complaints", item._docId, { ...(ackDue ? { acknowledgementAlertedAt: now } : { responseAlertedAt: now }) });
        } catch { /* Keep the complaint visible if notification delivery is unavailable. */ }
      })();
    });
  }, [now, workspace.profile?.userId, complaints.length, members.length]);

  const createComplaint = async () => {
    if (!form.title.trim() || !form.client.trim() || !form.summary.trim()) return toast.error("Add a complaint title, client and summary before saving.");
    if (form.sharePointUrl.trim() && !/^https:\/\//i.test(form.sharePointUrl.trim())) return toast.error("The SharePoint link must start with https://.");
    setSaving(true);
    try {
      const receivedAt = Date.now();
      const driver = drivers.find((item: any) => String(item.id) === form.driverId || item._docId === form.driverId);
      const owner = members.find((item: any) => /stephen/i.test(item.displayName)) || members.find((item: any) => item.memberRole === "lead") || workspace.profile;
      const reference = `CMP-${new Date(receivedAt).getFullYear()}-${String(complaints.length + 1).padStart(4, "0")}`;
      const value = { recordType: "complaint", id: receivedAt, reference, title: form.title.trim(), client: form.client.trim(), clientEmail: form.clientEmail.trim(), receivedAt, category: form.category, stage: "received" as ComplaintStage, summary: form.summary.trim(), driverId: form.driverId, driverName: driver ? String(driver.name || driver.displayName || driver.driverName || driver.id) : "", vehicle: form.vehicle.trim(), serviceDate: form.serviceDate, serviceDetails: form.serviceDetails.trim(), sharePointUrl: form.sharePointUrl.trim(), acknowledgementDueAt: addWorkingHours(receivedAt, 8), responseDueAt: addWorkingHours(receivedAt, 16), acknowledgedAt: null, acknowledgementNote: "", investigationFindings: "", decision: "", clientResponse: "", outcome: "", rootCause: "", ownerTeamMemberId: owner?.id ?? null, tasks: defaultTasks(owner?.displayName || workspace.profile?.displayName || "Unassigned", receivedAt), createdByName: workspace.profile?.displayName || "Unknown", createdByUserId: workspace.authUser?.uid || "", acknowledgementAlertedAt: null, responseAlertedAt: null, closedAt: null };
      const result = await workspace.add("complaints", value);
      setSelectedId(result._docId); setForm(freshForm()); setOpen(false); toast.success(`Complaint ${reference} logged with actions and deadlines.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "The complaint could not be saved."); }
    finally { setSaving(false); }
  };
  const patchSelected = async (changes: Record<string, unknown>, message: string) => {
    if (!selected) return;
    try { await workspace.patch("complaints", selected._docId, changes); toast.success(message); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Changes could not be saved."); }
  };
  const moveStage = async (stage: ComplaintStage) => {
    if (!selected) return;
    if (stage === "closed") {
      const unfinished = selected.tasks.filter(task => task.status === "pending");
      if (unfinished.length) return toast.error("Complete or formally waive every task before closing this complaint.");
      if (!selected.outcome.trim()) return toast.error("Record the final outcome before closing the complaint.");
      await patchSelected({ stage, closedAt: Date.now() }, "Complaint closed. Its record remains available in the register.");
      return;
    }
    await patchSelected({ stage }, `Stage updated to ${stageLabel(stage)}.`);
  };
  const acknowledge = async () => {
    if (!selected) return;
    await patchSelected({ acknowledgedAt: Date.now(), acknowledgementNote: noteDraft.trim() || "Acknowledgement recorded." }, "Acknowledgement recorded.");
    setNoteDraft("");
  };
  const saveText = async (field: string, value: string, label: string) => patchSelected({ [field]: value.trim() }, `${label} saved.`);
  const updateTask = async (taskId: string, changes: Partial<ComplaintTask>) => {
    if (!selected) return;
    const tasks = selected.tasks.map(task => task.id === taskId ? { ...task, ...changes, ...(changes.status === "complete" || changes.status === "waived" ? { completedAt: Date.now() } : {}) } : task);
    await patchSelected({ tasks }, "Task updated.");
  };
  const addTask = async () => {
    if (!selected || !taskDraft.trim()) return toast.error("Enter a task title.");
    const owner = members.find((member: any) => String(member.id) === newTaskOwner);
    const task: ComplaintTask = { id: `t-${Date.now()}`, title: taskDraft.trim(), owner: owner?.displayName || workspace.profile?.displayName || "Unassigned", dueAt: addWorkingHours(Date.now(), 8), status: "pending", note: "" };
    await patchSelected({ tasks: [...selected.tasks, task] }, "Task added.");
    setTaskDraft(""); setNewTaskOwner("");
  };
  const editForm = (key: string, value: string) => setForm(current => ({ ...current, [key]: value }));

  if (workspace.error) return <LoadError message="Complaints could not be loaded. Existing records have not been changed." onRetry={() => void workspace.refresh()} />;
  return <div className="mx-auto max-w-[1500px] pb-10">
    <PageHeader eyebrow="Customer experience · Investigation and resolution" title="Complaints management" description="One place to log complaints, coordinate the investigation, manage response deadlines and spot repeat driver or vehicle themes." actions={<Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="bg-[#1D5C63] hover:bg-[#164B50]" onClick={() => setForm(freshForm())}><Plus className="mr-2 h-4 w-4" />Log complaint</Button></DialogTrigger><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Log a new complaint</DialogTitle><DialogDescription>Record what was reported first. Findings and responsibility are added after investigation.</DialogDescription></DialogHeader>
      <div className="grid gap-4 py-2 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>Complaint title *</Label><Input value={form.title} onChange={e => editForm("title", e.target.value)} placeholder="e.g. Coach arrived late for school collection" /></div><div className="space-y-2"><Label>Client / organisation *</Label><Input value={form.client} onChange={e => editForm("client", e.target.value)} placeholder="Client name" /></div><div className="space-y-2"><Label>Client email</Label><Input type="email" value={form.clientEmail} onChange={e => editForm("clientEmail", e.target.value)} placeholder="Contact email" /></div><div className="space-y-2"><Label>Category</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.category} onChange={e => editForm("category", e.target.value)}>{categories.map(category => <option key={category}>{category}</option>)}</select></div><div className="space-y-2"><Label>Driver (if relevant)</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.driverId} onChange={e => editForm("driverId", e.target.value)}><option value="">No driver linked / not known yet</option>{drivers.map((driver: any) => <option key={driver._docId || driver.id} value={String(driver.id ?? driver._docId)}>{driver.name || driver.displayName || driver.driverName || driver.id}</option>)}</select></div><div className="space-y-2"><Label>Vehicle fleet number / registration</Label><Input value={form.vehicle} onChange={e => editForm("vehicle", e.target.value)} placeholder="e.g. V18SWA / registration" /></div><div className="space-y-2"><Label>Service date</Label><Input type="date" value={form.serviceDate} onChange={e => editForm("serviceDate", e.target.value)} /></div><div className="space-y-2"><Label>Service / journey details</Label><Input value={form.serviceDetails} onChange={e => editForm("serviceDetails", e.target.value)} placeholder="Route, school, journey or booking reference" /></div><div className="space-y-2 sm:col-span-2"><Label>Complaint summary *</Label><Textarea value={form.summary} onChange={e => editForm("summary", e.target.value)} placeholder="What did the client report? Include dates, times and the impact." rows={4} /></div><div className="space-y-2 sm:col-span-2"><Label>SharePoint email / evidence link</Label><Input value={form.sharePointUrl} onChange={e => editForm("sharePointUrl", e.target.value)} placeholder="Paste the secure SharePoint link to the original email or folder" /><p className="text-[11px] text-muted-foreground">The link uses the permissions already set in SharePoint. The app does not copy or change the source file.</p></div></div><DialogFooter><Button disabled={saving} onClick={() => void createComplaint()} className="bg-[#1D5C63] hover:bg-[#164B50]">{saving ? "Saving…" : "Create complaint and tasks"}</Button></DialogFooter></DialogContent></Dialog>} />
    <section className="relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-r from-[#142E3B] via-[#1D5C63] to-[#278A87] p-5 text-white shadow-[0_18px_38px_-24px_rgba(17,65,65,0.65)] sm:p-6">
      <div className="absolute -right-8 -top-12 h-44 w-44 rounded-full border border-white/10" /><div className="absolute -right-1 -top-5 h-28 w-28 rounded-full border border-white/10" />
      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#C9F4E8]"><MessageSquareWarning className="h-3.5 w-3.5" />Customer experience</div><h2 className="text-xl font-bold tracking-tight sm:text-2xl">Complaints control room</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-white/75 sm:text-sm">A clearer view of deadlines, investigations, repeat themes and customer outcomes.</p></div>
        <div className="flex items-center gap-2 self-start rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-medium text-white/90 sm:self-center"><span className="h-2 w-2 rounded-full bg-[#8EF0C4] shadow-[0_0_0_4px_rgba(142,240,196,0.12)]" />Live case tracking</div>
      </div>
    </section>
    <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[{ label: "Open complaints", value: openCount, hint: "All stages before closure", icon: ClipboardList, tone: "text-[#2F7062]", bg: "bg-[#EAF4EF]" }, { label: "Acknowledgement overdue", value: ackOverdue, hint: "1 working day target", icon: Timer, tone: "text-[#A76A22]", bg: "bg-[#FFF3E0]" }, { label: "Full response overdue", value: responseOverdue, hint: "2 working day target", icon: AlertCircle, tone: "text-[#B54E42]", bg: "bg-[#FCEBE7]" }, { label: "Repeat driver links", value: driverPatterns.length, hint: "More than one recorded complaint", icon: UserRound, tone: "text-[#6B55A0]", bg: "bg-[#F0EBFC]" }].map(card => <Panel key={card.label} className={`relative overflow-hidden border border-[#E2E9E5] bg-white p-4 shadow-[0_12px_30px_-22px_rgba(23,53,43,0.35)] before:absolute before:inset-x-0 before:top-0 before:h-1 ${card.label === "Open complaints" ? "before:bg-[#36A18B]" : card.label === "Acknowledgement overdue" ? "before:bg-[#E6A23C]" : card.label === "Full response overdue" ? "before:bg-[#D85F55]" : "before:bg-[#8D73D2]"}`}><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-[#68786F]">{card.label}</p><p className="mt-2 text-3xl font-bold tracking-tight text-[#1F332B]">{card.value}</p><p className="mt-1 text-[11px] text-[#839089]">{card.hint}</p></div><span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${card.bg} ring-1 ring-black/[0.03]`}><card.icon className={`h-5 w-5 ${card.tone}`} /></span></div></Panel>)}
    </section>
    {driverPatterns.length ? <div className="mb-5 rounded-2xl border border-[#E7DFF6] bg-[#FBF9FF] p-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#725BA0]">Repeat driver signals to review</p><div className="mt-2 flex flex-wrap gap-2">{driverPatterns.map(item => <span key={item.id} className="rounded-lg border border-[#E5DDF4] bg-white px-3 py-2 text-xs text-[#5D4B83]">{item.name} · {item.count} complaints</span>)}</div><p className="mt-2 text-[11px] text-[#796B94]">These are prompts to check the evidence, not findings of fault.</p></div> : null}
    <div className="grid gap-5 xl:grid-cols-[minmax(340px,0.95fr)_minmax(0,1.35fr)]">
      <Panel className="overflow-hidden border border-[#DDE7E1] bg-white shadow-[0_18px_42px_-30px_rgba(22,58,46,0.42)]"><PanelHeading title="Complaint register" description="Select a record to work through its stages." action={<select aria-label="Filter complaints" className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={filter} onChange={e => setFilter(e.target.value)}><option value="active">Open only</option><option value="overdue">Overdue</option><option value="all">All records</option>{stages.map(stage => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select>} />
        {visible.length ? <div className="divide-y divide-[#EDF0EE]">{visible.map(item => <button key={item._docId} onClick={() => setSelectedId(item._docId)} className={`relative w-full border-l-[3px] px-4 py-4 text-left transition-all hover:bg-[#F4FAF7] hover:shadow-[inset_0_0_0_1px_rgba(48,130,108,0.08)] ${selectedId === item._docId ? "border-l-[#26977E] bg-gradient-to-r from-[#E8F6F0] to-white shadow-[inset_0_0_0_1px_rgba(48,130,108,0.12)]" : "border-l-transparent"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><span className="text-[10px] font-bold tracking-wide text-[#7D8A83]">{item.reference}</span><Badge className={`border-0 text-[10px] ${statusTone[item.stage]}`}>{stageLabel(item.stage)}</Badge></div><p className="mt-2 truncate text-sm font-semibold text-[#2A3932]">{item.title}</p><p className="mt-1 text-xs text-[#718078]">{item.client}{item.vehicle ? ` · ${item.vehicle}` : ""}</p></div><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#9AA69F]" /></div><div className="mt-3 flex flex-wrap gap-2 text-[10px]"><span className={`rounded-md px-2 py-1 ${!item.acknowledgedAt && now > item.acknowledgementDueAt && item.stage !== "closed" ? "bg-[#FCEBE7] text-[#B54E42]" : "bg-[#F2F5F3] text-[#68776F]"}`}>Ack: {item.acknowledgedAt ? "Done" : countdown(item.acknowledgementDueAt, now)}</span><span className={`rounded-md px-2 py-1 ${now > item.responseDueAt && item.stage !== "closed" ? "bg-[#FCEBE7] text-[#B54E42]" : "bg-[#F2F5F3] text-[#68776F]"}`}>Response: {item.stage === "closed" ? "Closed" : countdown(item.responseDueAt, now)}</span></div></button>)}</div> : <EmptyState title="No complaints in this view" description="Log a complaint to start the investigation, create the standard actions and start both SLA clocks." />}
      </Panel>
      <div className="min-w-0">{selected ? <Panel className="overflow-hidden border border-[#DDE7E1] bg-white shadow-[0_18px_42px_-30px_rgba(22,58,46,0.42)]"><div className="border-b border-[#E9EEEA] bg-gradient-to-r from-[#F2FAF6] via-white to-[#F1F8FC] px-5 py-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold tracking-wide text-[#7D8A83]">{selected.reference}</span><Badge className={`border-0 ${statusTone[selected.stage]}`}>{stageLabel(selected.stage)}</Badge></div><h2 className="mt-2 text-xl font-semibold tracking-tight text-[#263630]">{selected.title}</h2><p className="mt-1 text-sm text-[#738078]">{selected.client} · Received {dateText(selected.receivedAt)}</p></div>{selected.sharePointUrl ? <a href={selected.sharePointUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-[#DDE7E1] bg-white px-3 py-2 text-xs font-semibold text-[#2D6559]"><ExternalLink className="h-3.5 w-3.5" />Open source email</a> : null}</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className={`rounded-xl border border-black/[0.04] p-3 shadow-sm ${!selected.acknowledgedAt && now > selected.acknowledgementDueAt && selected.stage !== "closed" ? "bg-[#FFF0EC]" : "bg-[#F3F7F4]"}`}><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#79867F]">Acknowledgement · 1 working day</p><p className={`mt-1 text-lg font-semibold ${!selected.acknowledgedAt && now > selected.acknowledgementDueAt ? "text-[#B54E42]" : "text-[#315B50]"}`}>{selected.acknowledgedAt ? "Acknowledged" : countdown(selected.acknowledgementDueAt, now)}</p><p className="mt-1 text-[10px] text-[#829088]">Due {dateText(selected.acknowledgementDueAt)}</p></div><div className={`rounded-xl p-3 ${now > selected.responseDueAt && !selected.clientResponse.trim() && selected.stage !== "closed" ? "bg-[#FFF0EC]" : "bg-[#F3F7F4]"}`}><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#79867F]">Full response · 2 working days</p><p className={`mt-1 text-lg font-semibold ${now > selected.responseDueAt && !selected.clientResponse.trim() && selected.stage !== "closed" ? "text-[#B54E42]" : "text-[#315B50]"}`}>{selected.stage === "closed" ? "Closed" : selected.clientResponse.trim() ? "Response recorded" : countdown(selected.responseDueAt, now)}</p><p className="mt-1 text-[10px] text-[#829088]">Due {dateText(selected.responseDueAt)}</p></div></div>
        </div>
        <div className="space-y-5 p-5"><section><h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#47685A]"><span className="h-5 w-1 rounded-full bg-[#5A9DCE]" />Case details</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-[#F7F9F7] p-3"><p className="text-[10px] text-[#819087]">Category</p><p className="mt-1 text-sm font-medium text-[#394941]">{selected.category}</p></div><div className="rounded-xl bg-[#F7F9F7] p-3"><p className="text-[10px] text-[#819087]">Driver / vehicle</p><p className="mt-1 text-sm font-medium text-[#394941]">{selected.driverName || "No driver linked"} · {selected.vehicle || "No vehicle recorded"}</p></div><div className="rounded-xl bg-[#F7F9F7] p-3 sm:col-span-2"><p className="text-[10px] text-[#819087]">Original complaint</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#394941]">{selected.summary}</p>{selected.serviceDetails ? <p className="mt-2 text-xs text-[#6C7B73]">Service: {selected.serviceDetails}{selected.serviceDate ? ` · ${selected.serviceDate}` : ""}</p> : null}</div></div></section>
          <section><div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#47685A]"><span className="h-5 w-1 rounded-full bg-[#8D73D2]" />Workflow stage</h3><span className="text-[10px] text-[#849088]">Move forward as the case progresses</span></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">{stages.map((stage, index) => <button key={stage.value} disabled={selected.stage === "closed" && stage.value !== "closed"} onClick={() => void moveStage(stage.value)} className={`rounded-xl border px-2 py-3 text-left text-[10px] font-semibold transition-colors ${selected.stage === stage.value ? "border-[#2B7162] bg-[#EAF4EF] text-[#245E52]" : "border-[#E3E9E5] bg-white text-[#77847D] hover:bg-[#F5F8F6]"}`}><span className="block text-[9px] opacity-60">0{index + 1}</span><span className="mt-1 block leading-4">{stage.label}</span></button>)}</div></section>
          <section><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#47685A]"><span className="h-5 w-1 rounded-full bg-[#E6A23C]" />Tasks and evidence checks</h3><span className="text-[10px] text-[#849088]">{selected.tasks.filter(task => task.status !== "pending").length}/{selected.tasks.length} complete or waived</span></div><div className="mt-3 space-y-2">{selected.tasks.map(task => <div key={task.id} className="rounded-xl border border-[#E6ECE8] p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><p className={`text-sm font-medium ${task.status !== "pending" ? "text-[#819087] line-through" : "text-[#394941]"}`}>{task.title}</p><p className="mt-1 text-[10px] text-[#839088]">Owner: {task.owner} · Due {task.dueAt ? dateText(task.dueAt) : "Not set"}</p>{task.note ? <p className="mt-2 text-xs text-[#6D7A73]">{task.note}</p> : null}</div><div className="flex flex-wrap gap-1.5">{task.status === "pending" ? <><Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => void updateTask(task.id, { status: "complete", completedAt: now })}><CheckCircle2 className="mr-1 h-3 w-3" />Complete</Button><Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => { const reason = window.prompt("Why is this task not required? This reason will be retained."); if (reason?.trim()) void updateTask(task.id, { status: "waived", note: `Waived: ${reason.trim()}` }); }}>Waive</Button></> : <Badge className="border-0 bg-[#EAF4EF] text-[#34704B]">{task.status === "waived" ? "Waived" : "Complete"}</Badge>}</div></div></div>)}</div><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px_auto]"><Input value={taskDraft} onChange={e => setTaskDraft(e.target.value)} placeholder="Add an investigation or follow-up task" /><select className="h-10 rounded-md border border-input bg-background px-2 text-xs" value={newTaskOwner} onChange={e => setNewTaskOwner(e.target.value)}><option value="">Owner: me</option>{members.map((member: any) => <option key={member.id} value={String(member.id)}>{member.displayName}</option>)}</select><Button variant="outline" onClick={() => void addTask()}><Plus className="mr-1 h-3.5 w-3.5" />Add task</Button></div></section>
          <section className="rounded-xl border border-[#DDE7E1] bg-gradient-to-br from-white to-[#FAFCFB] p-4 shadow-[0_8px_24px_-22px_rgba(23,53,43,0.35)]"><h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#385F51]"><span className="h-5 w-1 rounded-full bg-[#36A18B]" />Investigation, decision and outcome</h3><div className="mt-3 space-y-3"><div className="space-y-1.5"><Label className="text-xs">Investigation findings</Label><Textarea key={`${selected._docId}-findings`} defaultValue={selected.investigationFindings} onBlur={e => { if (e.target.value !== selected.investigationFindings) void saveText("investigationFindings", e.target.value, "Findings"); }} rows={3} placeholder="Evidence checked, driver account, vehicle records, CCTV / telematics, relevant context…" /></div><div className="space-y-1.5"><Label className="text-xs">Decision / proposed action</Label><Textarea key={`${selected._docId}-decision`} defaultValue={selected.decision} onBlur={e => { if (e.target.value !== selected.decision) void saveText("decision", e.target.value, "Decision"); }} rows={2} placeholder="What decision has been reached and why?" /></div><div className="space-y-1.5"><Label className="text-xs">Client response sent / response record</Label><Textarea key={`${selected._docId}-response`} defaultValue={selected.clientResponse} onBlur={e => { if (e.target.value !== selected.clientResponse) void saveText("clientResponse", e.target.value, "Client response"); }} rows={2} placeholder="Record the response sent and when. Email sending is not automatic in this first version." /></div><section className="relative overflow-hidden rounded-xl border border-[#B9DED1] bg-gradient-to-br from-[#F0FBF6] via-white to-[#F2F7FF] p-4 shadow-[0_10px_28px_-22px_rgba(30,100,78,0.45)]"><div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[#36A18B] to-[#6F8FE8]" /><h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#245F50]"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#D9F3E8] text-[#247C64]"><Sparkles className="h-3.5 w-3.5" /></span>Cost and financial impact</h3><p className="mt-1 text-[11px] text-[#718078]">Record any client refund or credit so the cost is retained against this complaint.</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><div className="space-y-1.5"><Label className="text-xs">Credit / refund amount (£)</Label><Input key={`${selected._docId}-refund`} type="number" min="0" step="0.01" defaultValue={selected.refundAmount ?? 0} onBlur={e => { const amount = Math.max(0, Number(e.target.value) || 0); if (amount !== Number(selected.refundAmount || 0)) void patchSelected({ refundAmount: amount }, "Refund / credit amount saved."); }} /></div><div className="space-y-1.5"><Label className="text-xs">Financial status</Label><select key={`${selected._docId}-financial-status`} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" defaultValue={selected.financialStatus || "none"} onChange={e => void patchSelected({ financialStatus: e.target.value }, "Financial status saved.")}><option value="none">No refund / credit</option><option value="pending_approval">Pending approval</option><option value="approved">Approved</option><option value="issued">Issued / credited</option><option value="declined">Declined</option></select></div><div className="space-y-1.5"><Label className="text-xs">Financial-impact notes</Label><Input key={`${selected._docId}-financial-note`} defaultValue={selected.financialNote || ""} onBlur={e => { if (e.target.value !== (selected.financialNote || "")) void patchSelected({ financialNote: e.target.value.trim() }, "Financial notes saved."); }} placeholder="Reason, approval or credit reference" /></div></div></section><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label className="text-xs">Root cause (if established)</Label><Input key={`${selected._docId}-cause`} defaultValue={selected.rootCause} onBlur={e => { if (e.target.value !== selected.rootCause) void saveText("rootCause", e.target.value, "Root cause"); }} placeholder="e.g. vehicle defect confirmed / no fault established" /></div><div className="space-y-1.5"><Label className="text-xs">Final outcome *</Label><Input key={`${selected._docId}-outcome`} defaultValue={selected.outcome} onBlur={e => { if (e.target.value !== selected.outcome) void saveText("outcome", e.target.value, "Outcome"); }} placeholder="e.g. Upheld, partially upheld, not substantiated" /></div></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={Boolean(selected.acknowledgedAt)} onClick={() => void acknowledge()}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />{selected.acknowledgedAt ? `Acknowledged ${dateText(selected.acknowledgedAt)}` : "Mark acknowledged"}</Button>{selected.stage !== "closed" ? <Button size="sm" className="bg-[#1D5C63] hover:bg-[#164B50]" onClick={() => void moveStage("closed")}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Close complaint</Button> : <Badge className="border-0 bg-[#EAF4EF] text-[#34704B]">Closed {dateText(selected.closedAt)}</Badge>}</div><p className="text-[10px] leading-4 text-[#859189]">Closing requires an outcome and every task to be complete or formally waived. The record remains available for reporting and repeat-issue reviews.</p></div></section>
          <div className="rounded-xl bg-[#F7F9F7] p-3 text-[10px] leading-5 text-[#7B8981]"><FileText className="mr-1 inline h-3.5 w-3.5" />Created by {selected.createdByName} · Last updated {dateText(selected.updatedAt)} · Owner {members.find((member: any) => member.id === selected.ownerTeamMemberId)?.displayName || "Not assigned"}</div>
        </div></Panel> : <Panel><EmptyState title="Select a complaint" description="Choose a case from the register to manage its deadlines, investigation, actions and outcome." /></Panel>}</div>
    </div>
    <div className="mt-5 rounded-xl border border-[#E2E9E4] bg-[#F8FBF9] p-4"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#43816F]" /><div><p className="text-xs font-semibold text-[#3D5B4F]">How the timers work</p><p className="mt-1 text-[11px] leading-5 text-[#738279]">Deadlines count 09:00–17:00 Monday to Friday, excluding the England and Wales bank holidays listed for 2026–2027. The acknowledgement target is 8 working hours and the full response target is 16 working hours from receipt. This first version calculates and displays live countdowns while the app is open. Overdue alerts are created in-app when this page is active, not by a background scheduler. Stephen receives them if his active team profile and email are present.</p></div></div></div>
  </div>;
}
