import { useWorkspace } from "@/contexts/WorkspaceContext";
import { hasWorkspacePermission } from "@/lib/access";
import { Panel, PanelHeading, EmptyState, LoadError } from "@/components/WorkspacePrimitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardList, ExternalLink, FileText, Plus, ShieldAlert, Timer, UserRound, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type ComplaintStage = "received" | "investigating" | "decision" | "client_response" | "closed";
type ComplaintTask = { id: string; title: string; owner: string; dueAt: number | null; status: "pending" | "complete" | "waived"; note: string; completedAt?: number; };
type Complaint = { customerSpend12Months?: number; bookingCost?: number; refundAmount?: number; subcontractedCost?: number; financialStatus?: string; financialNote?: string; _docId: string; id: number; reference: string; title: string; client: string; clientEmail: string; receivedAt: number; category: string; stage: ComplaintStage; summary: string; driverId: string; driverName: string; vehicle: string; serviceDate: string; serviceDetails: string; sharePointUrl: string; complaintFolderUrl?: string; acknowledgementDueAt: number; responseDueAt: number; acknowledgedAt: number | null; acknowledgementNote: string; investigationFindings: string; decision: string; clientResponse: string; outcome: string; rootCause: string; ownerTeamMemberId: number | null; tasks: ComplaintTask[]; acknowledgementAlertedAt?: number | null; responseAlertedAt?: number | null; closedAt?: number | null; createdByName: string; createdByUserId: string; createdAt: number; updatedAt: number; };
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
const statusTone: Record<string, string> = { received: "bg-[#EAF1FF] text-[#315A9C]", investigating: "bg-[#FFF4E3] text-[#986321]", decision: "bg-[#F0EAFE] text-[#6A4AA1]", client_response: "bg-[#E5F4F2] text-[#216D63]", closed: "bg-[#EAF4EC] text-[#286B8D]" };
const defaultTasks = (owner: string, now: number): ComplaintTask[] => [
  { id: `t-${now}-1`, title: "Acknowledge complaint to client", owner, dueAt: addWorkingHours(now, 8), status: "pending", note: "" },
  { id: `t-${now}-2`, title: "Gather evidence and check records", owner, dueAt: addWorkingHours(now, 4), status: "pending", note: "" },
  { id: `t-${now}-3`, title: "Obtain driver / depot account where relevant", owner, dueAt: addWorkingHours(now, 8), status: "pending", note: "" },
  { id: `t-${now}-4`, title: "Record findings and proposed outcome", owner, dueAt: addWorkingHours(now, 12), status: "pending", note: "" },
  { id: `t-${now}-5`, title: "Send full response to client", owner, dueAt: addWorkingHours(now, 40), status: "pending", note: "" },
];
const responseDeadline = (item: Complaint) => item.responseDueAt || addWorkingHours(item.receivedAt, 40);
const freshForm = () => ({ title: "", client: "", clientEmail: "", customerSpend12Months: "", category: "Driver conduct", summary: "", driverId: "", vehicle: "", serviceDate: "", serviceDetails: "", sharePointUrl: "", complaintFolderUrl: "" });

export default function Complaints() {
  const workspace = useWorkspace();
  const canEditComplaints = hasWorkspacePermission(workspace.profile?.memberRole, "editComplaints");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(freshForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRepeatDriverId, setSelectedRepeatDriverId] = useState<string | null>(null);
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
  const visible = ordered.filter(item => filter === "all" || (filter === "active" ? item.stage !== "closed" : filter === "overdue" ? item.stage !== "closed" && (now > item.acknowledgementDueAt && !item.acknowledgedAt || now > responseDeadline(item)) : item.stage === filter));
  const selected = complaints.find(item => item._docId === selectedId) || null;
  const openCount = complaints.filter(item => item.stage !== "closed").length;
  const ackOverdue = complaints.filter(item => item.stage !== "closed" && !item.acknowledgedAt && now > item.acknowledgementDueAt).length;
  const responseOverdue = complaints.filter(item => item.stage !== "closed" && !item.clientResponse.trim() && now > responseDeadline(item)).length;
  const driverPatterns = useMemo(() => { const counts = new Map<string, number>(); complaints.filter(item => item.driverId && item.stage !== "closed" ? true : Boolean(item.driverId)).forEach(item => counts.set(item.driverId, (counts.get(item.driverId) || 0) + 1)); return [...counts.entries()].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count, name: complaints.find(item => item.driverId === id)?.driverName || id })); }, [complaints]);
  const selectedRepeatDriver = driverPatterns.find(item => item.id === selectedRepeatDriverId) || null;
  const repeatDriverComplaints = selectedRepeatDriver ? complaints.filter(item => item.driverId === selectedRepeatDriver.id).sort((a, b) => b.receivedAt - a.receivedAt) : [];
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  // Notify Stephen in-app once an SLA first becomes overdue while the module is active.
  useEffect(() => {
    if (!workspace.profile || !canEditComplaints) return;
    const stephen = members.find((member: any) => /stephen/i.test(member.displayName));
    if (!stephen?.email) return;
    complaints.forEach(item => {
      if (item.stage === "closed") return;
      const ackDue = !item.acknowledgedAt && now > item.acknowledgementDueAt && !item.acknowledgementAlertedAt;
      const responseDue = !item.clientResponse.trim() && now > responseDeadline(item) && !item.responseAlertedAt;
      if (!ackDue && !responseDue) return;
      void (async () => {
        try {
          const kind = ackDue ? "acknowledgement" : "full response";
          await workspace.add("notifications", { id: Date.now(), recipientEmail: stephen.email, type: "complaint_overdue", title: `Complaint ${item.reference} overdue`, body: `${item.title}: ${kind} deadline has passed.`, readAt: null });
          await workspace.patch("complaints", item._docId, { ...(ackDue ? { acknowledgementAlertedAt: now } : { responseAlertedAt: now }) });
        } catch { /* Keep the complaint visible if notification delivery is unavailable. */ }
      })();
    });
  }, [now, workspace.profile?.userId, canEditComplaints, complaints.length, members.length]);

  const createComplaint = async () => {
    if (!canEditComplaints) return toast.error("You have view-only access to complaints.");
    if (!form.title.trim() || !form.client.trim() || !form.summary.trim()) return toast.error("Add a complaint title, client and summary before saving.");
    if (form.customerSpend12Months.trim() === "" || !Number.isFinite(Number(form.customerSpend12Months)) || Number(form.customerSpend12Months) < 0) return toast.error("Enter the customer’s total spend in the last 12 months (£).");
    if (form.sharePointUrl.trim() && !/^https:\/\//i.test(form.sharePointUrl.trim())) return toast.error("The source email link must start with https://.");
    if (form.complaintFolderUrl.trim() && !/^https:\/\//i.test(form.complaintFolderUrl.trim())) return toast.error("The SharePoint complaint folder link must start with https://.");
    setSaving(true);
    try {
      const receivedAt = Date.now();
      const driver = drivers.find((item: any) => String(item.id) === form.driverId || item._docId === form.driverId);
      const owner = members.find((item: any) => /stephen/i.test(item.displayName)) || members.find((item: any) => item.memberRole === "lead") || workspace.profile;
      const reference = `CMP-${new Date(receivedAt).getFullYear()}-${String(complaints.length + 1).padStart(4, "0")}`;
      const value = { recordType: "complaint", id: receivedAt, reference, title: form.title.trim(), client: form.client.trim(), clientEmail: form.clientEmail.trim(), customerSpend12Months: Number(form.customerSpend12Months), receivedAt, category: form.category, stage: "received" as ComplaintStage, summary: form.summary.trim(), driverId: form.driverId, driverName: driver ? String(driver.name || driver.displayName || driver.driverName || driver.id) : "", vehicle: form.vehicle.trim(), serviceDate: form.serviceDate, serviceDetails: form.serviceDetails.trim(), sharePointUrl: form.sharePointUrl.trim(), complaintFolderUrl: form.complaintFolderUrl.trim(), acknowledgementDueAt: addWorkingHours(receivedAt, 8), responseDueAt: addWorkingHours(receivedAt, 40), acknowledgedAt: null, acknowledgementNote: "", investigationFindings: "", decision: "", clientResponse: "", outcome: "", rootCause: "", ownerTeamMemberId: owner?.id ?? null, tasks: defaultTasks(owner?.displayName || workspace.profile?.displayName || "Unassigned", receivedAt), createdByName: workspace.profile?.displayName || "Unknown", createdByUserId: workspace.authUser?.uid || "", acknowledgementAlertedAt: null, responseAlertedAt: null, closedAt: null };
      const result = await workspace.add("complaints", value);
      setSelectedId(result._docId); setForm(freshForm()); setOpen(false);
      // Send a management alert only for a newly created complaint. Email failure must not undo the saved complaint.
      try {
        const idToken = await workspace.authUser?.getIdToken();
        if (!idToken) throw new Error("Your session could not be verified.");
        const emailResponse = await fetch("/api/new-complaint-email", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ complaint: { ...value, _docId: result._docId } }),
        });
        if (!emailResponse.ok) {
          const emailResult = await emailResponse.json().catch(() => ({}));
          toast.warning(`Complaint ${reference} was saved, but Kieran's email alert could not be sent.`, { description: emailResult.error || "Check the email service configuration." });
        } else {
          toast.success(`Complaint ${reference} logged and email alert sent to Kieran.`);
        }
      } catch {
        toast.warning(`Complaint ${reference} was saved, but the email alert could not be sent.`);
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : "The complaint could not be saved."); }
    finally { setSaving(false); }
  };
  const deleteSelected = async () => {
    if (!selected || !["lead", "manager"].includes(workspace.profile?.memberRole || "")) return toast.error("Only an operations lead or manager can delete complaint records.");
    const reason = window.prompt(`Enter the reason for deleting complaint ${selected.reference}. This will be retained in the audit record:`);
    if (!reason?.trim()) return toast.error("A deletion reason is required. The record has not been deleted.");
    if (!window.confirm(`Delete complaint ${selected.reference}? It will be removed from the complaints register and reports, but retained in the audit history.`)) return;
    try {
      const deletedAt = Date.now();
      await workspace.patch("complaints", selected._docId, {
        isDeleted: true,
        deletedAt,
        deletedByUserId: workspace.authUser?.uid || "",
        deletedByName: workspace.profile?.displayName || "Unknown user",
        deletionReason: reason.trim(),
      });
      await workspace.add("auditLogs", {
        actorUserId: workspace.authUser?.uid || "",
        actorName: workspace.profile?.displayName || "Unknown user",
        action: "deleted",
        targetType: "complaint",
        targetId: selected._docId,
        summary: `Deleted complaint ${selected.reference}: ${reason.trim()}`,
        reason: reason.trim(),
        createdAt: deletedAt,
      });
      setSelectedId(null);
      toast.success(`Complaint ${selected.reference} removed from the register. The reason has been retained.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The complaint could not be deleted.");
    }
  };
  const patchSelected = async (changes: Record<string, unknown>, message: string) => {
    if (!selected || !canEditComplaints) return;
    try { await workspace.patch("complaints", selected._docId, changes); toast.success(message); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Changes could not be saved."); }
  };
  const moveStage = async (stage: ComplaintStage) => {
    if (!selected) return;
    if (stage === "closed") {
      const unfinished = selected.tasks.filter(task => task.status === "pending");
      if (unfinished.length) return toast.error("Complete or formally waive every task before closing this complaint.");
      if (!selected.acknowledgedAt) return toast.error("Record the client acknowledgement before closing this complaint.");
      if (!selected.clientResponse.trim()) return toast.error("Record the full client response before closing this complaint.");
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
  const saveText = async (field: string, value: string, label: string) => {
    if (!selected) return;
    const changes: Record<string, unknown> = { [field]: value.trim() };
    // Once the proposed decision is recorded, move the case into the client-response stage.
    if (field === "decision" && value.trim() && selected.stage === "decision") changes.stage = "client_response";
    await patchSelected(changes, `${label} saved.`);
  };
  const updateTask = async (taskId: string, changes: Partial<ComplaintTask>) => {
    if (!selected) return;
    const tasks = selected.tasks.map(task => task.id === taskId ? { ...task, ...changes, ...(changes.status === "complete" || changes.status === "waived" ? { completedAt: Date.now() } : {}) } : task);
    const changedTask = tasks.find(task => task.id === taskId);
    let stage = selected.stage;

    // Acknowledgement is an SLA milestone, not an investigation task.
    const isInvestigationWork = changedTask && !/acknowledge complaint|send full response/i.test(changedTask.title);
    const completedInvestigationWork = tasks.some(task => task.status !== "pending" && /gather evidence|obtain driver|depot account|record findings|investigation/i.test(task.title));

    // Move into Investigation as soon as the team starts completing investigation work.
    if (stage === "received" && isInvestigationWork && completedInvestigationWork) stage = "investigating";

    // Recording findings and a proposed outcome completes the investigation stage.
    const findingsTaskComplete = tasks.some(task => task.status !== "pending" && /record findings and proposed outcome/i.test(task.title));
    if (stage === "investigating" && findingsTaskComplete) stage = "decision";

    // If the decision has already been recorded, move straight on to the client response.
    if (stage === "decision" && findingsTaskComplete && selected.decision.trim()) stage = "client_response";

    await patchSelected({ tasks, ...(stage !== selected.stage ? { stage } : {}) }, stage !== selected.stage ? `Task updated. Case moved to ${stageLabel(stage)}.` : "Task updated.");
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
  return <div className="mx-auto max-w-[1600px] space-y-6 pb-12">
    <section className="relative overflow-hidden rounded-[28px] bg-[#102638] px-6 py-7 text-white shadow-[0_24px_60px_-28px_rgba(10,35,54,0.7)] md:px-9 md:py-9">
      <div className="pointer-events-none absolute -right-16 -top-28 h-80 w-80 rounded-full border-[42px] border-[#2CC6C0]/10" />
      <div className="pointer-events-none absolute right-24 top-20 h-44 w-44 rounded-full bg-[#2CC6C0]/10 blur-3xl" />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#9FC4D8]"><span className="h-2 w-2 rounded-full bg-[#35D0C4] shadow-[0_0_0_5px_rgba(53,208,196,0.12)]" /> Operations command centre <span className="text-white/30">/</span> Customer experience</div>
          <h1 className="mt-5 text-3xl font-semibold tracking-[-0.045em] md:text-[42px]">Complaints</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#C1D4E0]">Log complaints, manage investigations and keep client response deadlines on track.</p>
        </div>
        {canEditComplaints ?         <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button className="bg-[#173B56] hover:bg-[#102C42]" onClick={() => setForm(freshForm())}><Plus className="mr-2 h-4 w-4" />Log complaint</Button></DialogTrigger><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Log a new complaint</DialogTitle><DialogDescription>Record what was reported first. Findings and responsibility are added after investigation.</DialogDescription></DialogHeader>
      <div className="grid gap-4 py-2 sm:grid-cols-2"><div className="space-y-2 sm:col-span-2"><Label>Complaint title *</Label><Input value={form.title} onChange={e => editForm("title", e.target.value)} placeholder="e.g. Coach arrived late for school collection" /></div><div className="space-y-2"><Label>Client / organisation *</Label><Input value={form.client} onChange={e => editForm("client", e.target.value)} placeholder="Client name" /></div><div className="space-y-2"><Label>Client email</Label><Input type="email" value={form.clientEmail} onChange={e => editForm("clientEmail", e.target.value)} placeholder="Contact email" /></div><div className="space-y-2"><Label>Customer spend in the last 12 months (£) *</Label><Input type="number" min="0" step="0.01" required value={form.customerSpend12Months} onChange={e => editForm("customerSpend12Months", e.target.value)} placeholder="e.g. 12500.00" /><p className="text-[11px] text-muted-foreground">Enter the total amount this customer has spent with Swans over the previous 12 months.</p></div><div className="space-y-2"><Label>Category</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.category} onChange={e => editForm("category", e.target.value)}>{categories.map(category => <option key={category}>{category}</option>)}</select></div><div className="space-y-2"><Label>Driver (if relevant)</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.driverId} onChange={e => editForm("driverId", e.target.value)}><option value="">No driver linked / not known yet</option>{drivers.map((driver: any) => <option key={driver._docId || driver.id} value={String(driver.id ?? driver._docId)}>{driver.name || driver.displayName || driver.driverName || driver.id}</option>)}</select></div><div className="space-y-2"><Label>Vehicle fleet number / registration</Label><Input value={form.vehicle} onChange={e => editForm("vehicle", e.target.value)} placeholder="e.g. V18SWA / registration" /></div><div className="space-y-2"><Label>Service date</Label><Input type="date" value={form.serviceDate} onChange={e => editForm("serviceDate", e.target.value)} /></div><div className="space-y-2"><Label>Service / journey details</Label><Input value={form.serviceDetails} onChange={e => editForm("serviceDetails", e.target.value)} placeholder="Route, school, journey or booking reference" /></div><div className="space-y-2 sm:col-span-2"><Label>Complaint summary *</Label><Textarea value={form.summary} onChange={e => editForm("summary", e.target.value)} placeholder="What did the client report? Include dates, times and the impact." rows={4} /></div><div className="space-y-2 sm:col-span-2"><Label>SharePoint complaint evidence folder (optional)</Label><Input value={form.complaintFolderUrl} onChange={e => editForm("complaintFolderUrl", e.target.value)} placeholder="Paste the SharePoint folder link for this complaint" /><p className="text-[11px] text-muted-foreground">Recommended: keep a client folder in SharePoint and create a separate subfolder for each complaint. Paste the complaint subfolder link here. The folder must already exist and staff need SharePoint access.</p></div></div><DialogFooter><Button disabled={saving} onClick={() => void createComplaint()} className="bg-[#173B56] hover:bg-[#102C42]">{saving ? "Saving…" : "Create complaint and tasks"}</Button></DialogFooter></DialogContent></Dialog> : null}
      </div>
    </section>
    <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[{ label: "Open complaints", value: openCount, hint: "All stages before closure", icon: ClipboardList, tone: "text-[#2F7062]", bg: "bg-[#EAF3F9]" }, { label: "Acknowledgement overdue", value: ackOverdue, hint: "1 working day target", icon: Timer, tone: "text-[#A76A22]", bg: "bg-[#FFF3E0]" }, { label: "Full response overdue", value: responseOverdue, hint: "5 working day target", icon: AlertCircle, tone: "text-[#B54E42]", bg: "bg-[#FCEBE7]" }, { label: "Repeat driver links", value: driverPatterns.length, hint: "More than one recorded complaint", icon: UserRound, tone: "text-[#6B55A0]", bg: "bg-[#F0EBFC]" }].map(card => <Panel key={card.label} className={`relative overflow-hidden border border-[#E2E9E5] bg-white p-4 shadow-[0_12px_30px_-22px_rgba(23,53,43,0.35)] before:absolute before:inset-x-0 before:top-0 before:h-1 ${card.label === "Open complaints" ? "before:bg-[#4B9FC4]" : card.label === "Acknowledgement overdue" ? "before:bg-[#E6A23C]" : card.label === "Full response overdue" ? "before:bg-[#D85F55]" : "before:bg-[#8D73D2]"}`}><div className="flex items-start justify-between"><div><p className="text-xs font-semibold text-[#68786F]">{card.label}</p><p className="mt-2 text-3xl font-bold tracking-tight text-[#1F332B]">{card.value}</p><p className="mt-1 text-[11px] text-[#839089]">{card.hint}</p></div><span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${card.bg} ring-1 ring-black/[0.03]`}><card.icon className={`h-5 w-5 ${card.tone}`} /></span></div></Panel>)}
    </section>
    {driverPatterns.length ? <div className="mb-5 rounded-2xl border border-[#E7DFF6] bg-[#FBF9FF] p-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#725BA0]">Repeat driver signals to review</p><div className="mt-2 flex flex-wrap gap-2">{driverPatterns.map(item => <button type="button" key={item.id} aria-expanded={selectedRepeatDriverId === item.id} onClick={() => setSelectedRepeatDriverId(current => current === item.id ? null : item.id)} className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${selectedRepeatDriverId === item.id ? "border-[#8D79BC] bg-[#EEE8FA] text-[#49366F]" : "border-[#E5DDF4] bg-white text-[#5D4B83] hover:bg-[#F3EFFA]"}`}>{item.name} · {item.count} complaints <span className="ml-1">{selectedRepeatDriverId === item.id ? "▲" : "▼"}</span></button>)}</div>{selectedRepeatDriver ? <div className="mt-4 rounded-xl border border-[#E5DDF4] bg-white p-3 sm:p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-[#49366F]">{selectedRepeatDriver.name}, complaint history</h3><p className="mt-1 text-xs text-[#796B94]">{repeatDriverComplaints.length} linked complaints · {repeatDriverComplaints.filter(item => item.stage !== "closed").length} open · {repeatDriverComplaints.filter(item => item.stage === "closed").length} closed</p></div><Button type="button" size="sm" variant="ghost" onClick={() => setSelectedRepeatDriverId(null)}>Close</Button></div><div className="mt-3 space-y-2">{repeatDriverComplaints.map(item => <button type="button" key={item._docId} onClick={() => { setFilter("all"); setSelectedId(item._docId); }} className="flex w-full flex-col gap-1 rounded-lg border border-[#ECE7F4] bg-[#FCFBFE] p-3 text-left transition-colors hover:border-[#B9A9D8] hover:bg-[#F7F3FC]"><span className="flex flex-wrap items-center gap-2 text-[10px] font-bold tracking-wide text-[#7D8A83]"><span>{item.reference}</span><span className={`rounded-full px-2 py-0.5 ${statusTone[item.stage]}`}>{stageLabel(item.stage)}</span><span className="font-normal tracking-normal">{dateText(item.receivedAt)}</span></span><span className="text-sm font-semibold text-[#34453D]">{item.title}</span><span className="text-xs text-[#738078]">{item.client}{item.vehicle ? ` · ${item.vehicle}` : ""}{item.category ? ` · ${item.category}` : ""}</span>{item.summary ? <span className="line-clamp-2 text-xs text-[#68766E]">{item.summary}</span> : null}<span className="mt-1 text-xs font-semibold text-[#65518C]">Open complaint record →</span></button>)}</div></div> : null}<p className="mt-2 text-[11px] text-[#796B94]">These are prompts to check the evidence, not findings of fault.</p></div> : null}
    <div className="grid gap-5 xl:grid-cols-[minmax(340px,0.95fr)_minmax(0,1.35fr)]">
      <Panel className="overflow-hidden border border-[#D8E5EF] bg-white shadow-[0_18px_42px_-30px_rgba(22,58,46,0.42)]"><PanelHeading title="Complaint register" description="Select a record to work through its stages." action={<select aria-label="Filter complaints" className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={filter} onChange={e => setFilter(e.target.value)}><option value="active">Open only</option><option value="overdue">Overdue</option><option value="all">All records</option>{stages.map(stage => <option key={stage.value} value={stage.value}>{stage.label}</option>)}</select>} />
        {visible.length ? <div className="divide-y divide-[#EDF0EE]">{visible.map(item => <button key={item._docId} onClick={() => setSelectedId(item._docId)} className={`relative w-full border-l-[3px] px-4 py-4 text-left transition-all hover:bg-[#F2F8FC] hover:shadow-[inset_0_0_0_1px_rgba(48,130,108,0.08)] ${selectedId === item._docId ? "border-l-[#26977E] bg-gradient-to-r from-[#EAF4FA] to-white shadow-[inset_0_0_0_1px_rgba(48,130,108,0.12)]" : "border-l-transparent"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><span className="text-[10px] font-bold tracking-wide text-[#7D8A83]">{item.reference}</span><Badge className={`border-0 text-[10px] ${statusTone[item.stage]}`}>{stageLabel(item.stage)}</Badge></div><p className="mt-2 truncate text-sm font-semibold text-[#263C4B]">{item.title}</p><p className="mt-1 text-xs text-[#607486]">{item.client}{item.vehicle ? ` · ${item.vehicle}` : ""}</p></div><ArrowRight className="mt-1 h-4 w-4 shrink-0 text-[#9AA69F]" /></div><div className="mt-3 flex flex-wrap gap-2 text-[10px]"><span className={`rounded-md px-2 py-1 ${!item.acknowledgedAt && now > item.acknowledgementDueAt && item.stage !== "closed" ? "bg-[#FCEBE7] text-[#B54E42]" : "bg-[#F2F5F3] text-[#68776F]"}`}>Ack: {item.acknowledgedAt ? "Done" : countdown(item.acknowledgementDueAt, now)}</span><span className={`rounded-md px-2 py-1 ${now > responseDeadline(item) && item.stage !== "closed" ? "bg-[#FCEBE7] text-[#B54E42]" : "bg-[#F2F5F3] text-[#68776F]"}`}>Response: {item.stage === "closed" ? "Closed" : countdown(responseDeadline(item), now)}</span></div></button>)}</div> : <EmptyState title="No complaints in this view" description="Log a complaint to start the investigation, create the standard actions and start both SLA clocks." />}
      </Panel>
      <div className="min-w-0">{selected ? <fieldset disabled={!canEditComplaints} className="min-w-0 border-0 p-0"><Panel className="overflow-hidden border border-[#D8E5EF] bg-white shadow-[0_18px_42px_-30px_rgba(22,58,46,0.42)]"><div className="border-b border-[#DCE7EF] bg-gradient-to-r from-[#F2F7FB] via-white to-[#F1F8FC] px-5 py-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-bold tracking-wide text-[#7D8A83]">{selected.reference}</span><Badge className={`border-0 ${statusTone[selected.stage]}`}>{stageLabel(selected.stage)}</Badge></div><h2 className="mt-2 text-xl font-semibold tracking-tight text-[#263630]">{selected.title}</h2><p className="mt-1 text-sm text-[#738078]">{selected.client} · Received {dateText(selected.receivedAt)}</p></div>{["lead", "manager"].includes(workspace.profile?.memberRole || "") ? <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => void deleteSelected()}>Delete record</Button> : null}{selected.complaintFolderUrl ? <a href={selected.complaintFolderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-[#B9DCEB] bg-[#EEF8FC] px-3 py-2 text-xs font-semibold text-[#285D78]"><ExternalLink className="h-3.5 w-3.5" />Open evidence folder</a> : null}</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className={`rounded-xl border border-black/[0.04] p-3 shadow-sm ${!selected.acknowledgedAt && now > selected.acknowledgementDueAt && selected.stage !== "closed" ? "bg-[#FFF0EC]" : "bg-[#F1F6FA]"}`}><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#79867F]">Acknowledgement · 1 working day</p><p className={`mt-1 text-lg font-semibold ${!selected.acknowledgedAt && now > selected.acknowledgementDueAt ? "text-[#B54E42]" : "text-[#315E7D]"}`}>{selected.acknowledgedAt ? "Acknowledged" : countdown(selected.acknowledgementDueAt, now)}</p><p className="mt-1 text-[10px] text-[#73879A]">Due {dateText(selected.acknowledgementDueAt)}</p></div><div className={`rounded-xl p-3 ${now > responseDeadline(selected) && !selected.clientResponse.trim() && selected.stage !== "closed" ? "bg-[#FFF0EC]" : "bg-[#F1F6FA]"}`}><p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#79867F]">Full response · 5 working days</p><p className={`mt-1 text-lg font-semibold ${now > responseDeadline(selected) && !selected.clientResponse.trim() && selected.stage !== "closed" ? "text-[#B54E42]" : "text-[#315E7D]"}`}>{selected.stage === "closed" ? "Closed" : selected.clientResponse.trim() ? "Response recorded" : countdown(responseDeadline(selected), now)}</p><p className="mt-1 text-[10px] text-[#73879A]">Due {dateText(responseDeadline(selected))}</p></div></div>
        </div>
        <div className="space-y-5 p-5"><section><h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#42627A]"><span className="h-5 w-1 rounded-full bg-[#5A9DCE]" />Case details</h3><div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-[#F5F8FB] p-3"><p className="text-[10px] text-[#819087]">Category</p><p className="mt-1 text-sm font-medium text-[#263C4B]">{selected.category}</p></div><div className="rounded-xl bg-[#F5F8FB] p-3"><p className="text-[10px] text-[#819087]">Customer spend · last 12 months</p><p className="mt-1 text-sm font-semibold text-[#263C4B]">{selected.customerSpend12Months == null ? "Not recorded" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(selected.customerSpend12Months)}</p></div><div className="rounded-xl bg-[#F5F8FB] p-3"><p className="text-[10px] text-[#819087]">Driver / vehicle</p><p className="mt-1 text-sm font-medium text-[#263C4B]">{selected.driverName || "No driver linked"} · {selected.vehicle || "No vehicle recorded"}</p></div><div className="rounded-xl bg-[#F5F8FB] p-3 sm:col-span-2"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[10px] text-[#819087]">SharePoint evidence folder</p><p className="mt-1 text-xs text-[#607486]">{selected.complaintFolderUrl ? "Folder linked. Use the Open evidence folder button above." : "No evidence folder linked yet. Paste the SharePoint complaint subfolder link below."}</p></div>{selected.complaintFolderUrl ? <a href={selected.complaintFolderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2D6D91]"><ExternalLink className="h-3.5 w-3.5" />Open folder</a> : null}</div><div className="mt-2 flex flex-col gap-2 sm:flex-row"><Input key={`${selected._docId}-complaint-folder-url`} defaultValue={selected.complaintFolderUrl || ""} onBlur={e => { const url = e.target.value.trim(); if (url !== (selected.complaintFolderUrl || "")) { if (url && !/^https:\/\//i.test(url)) { toast.error("The SharePoint folder link must start with https://."); e.target.value = selected.complaintFolderUrl || ""; return; } void patchSelected({ complaintFolderUrl: url }, "SharePoint evidence folder link saved."); } }} placeholder="Paste secure SharePoint folder URL" /><span className="self-center text-[10px] text-[#73879A]">Save by tapping away from the field</span></div></div><div className="rounded-xl bg-[#F5F8FB] p-3 sm:col-span-2"><p className="text-[10px] text-[#819087]">Original complaint</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-[#263C4B]">{selected.summary}</p>{selected.serviceDetails ? <p className="mt-2 text-xs text-[#607486]">Service: {selected.serviceDetails}{selected.serviceDate ? ` · ${selected.serviceDate}` : ""}</p> : null}</div></div></section>
          <section><div className="flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#42627A]"><span className="h-5 w-1 rounded-full bg-[#8D73D2]" />Workflow stage</h3><span className="text-[10px] text-[#73879A]">Move forward as the case progresses</span></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">{stages.map((stage, index) => <button key={stage.value} disabled={selected.stage === "closed" && stage.value !== "closed"} onClick={() => void moveStage(stage.value)} className={`rounded-xl border px-2 py-3 text-left text-[10px] font-semibold transition-colors ${selected.stage === stage.value ? "border-[#2B7162] bg-[#EAF3F9] text-[#245E52]" : "border-[#DCE7EF] bg-white text-[#77847D] hover:bg-[#F5F8F6]"}`}><span className="block text-[9px] opacity-60">0{index + 1}</span><span className="mt-1 block leading-4">{stage.label}</span></button>)}</div></section>
          <section><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#42627A]"><span className="h-5 w-1 rounded-full bg-[#E6A23C]" />Tasks and evidence checks</h3><span className="text-[10px] text-[#73879A]">{selected.tasks.filter(task => task.status !== "pending").length}/{selected.tasks.length} complete or waived</span></div><div className="mt-3 space-y-2">{selected.tasks.map(task => <div key={task.id} className="rounded-xl border border-[#DCE7EF] p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><p className={`text-sm font-medium ${task.status !== "pending" ? "text-[#819087] line-through" : "text-[#263C4B]"}`}>{task.title}</p><p className="mt-1 text-[10px] text-[#73879A]">Owner: {task.owner} · Due {task.dueAt ? dateText(task.dueAt) : "Not set"}</p>{task.note ? <p className="mt-2 text-xs text-[#6D7A73]">{task.note}</p> : null}</div><div className="flex flex-wrap gap-1.5">{task.status === "pending" ? <><Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => void updateTask(task.id, { status: "complete", completedAt: now })}><CheckCircle2 className="mr-1 h-3 w-3" />Complete</Button><Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => { const reason = window.prompt("Why is this task not required? This reason will be retained."); if (reason?.trim()) void updateTask(task.id, { status: "waived", note: `Waived: ${reason.trim()}` }); }}>Waive</Button></> : <Badge className="border-0 bg-[#EAF3F9] text-[#286B8D]">{task.status === "waived" ? "Waived" : "Complete"}</Badge>}</div></div></div>)}</div><div className="mt-3 grid gap-2 sm:grid-cols-[1fr_180px_auto]"><Input value={taskDraft} onChange={e => setTaskDraft(e.target.value)} placeholder="Add an investigation or follow-up task" /><select className="h-10 rounded-md border border-input bg-background px-2 text-xs" value={newTaskOwner} onChange={e => setNewTaskOwner(e.target.value)}><option value="">Owner: me</option>{members.map((member: any) => <option key={member.id} value={String(member.id)}>{member.displayName}</option>)}</select><Button variant="outline" onClick={() => void addTask()}><Plus className="mr-1 h-3.5 w-3.5" />Add task</Button></div></section>
          <section className="rounded-xl border border-[#D8E5EF] bg-gradient-to-br from-white to-[#FAFCFB] p-4 shadow-[0_8px_24px_-22px_rgba(23,53,43,0.35)]"><h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#315E7D]"><span className="h-5 w-1 rounded-full bg-[#4B9FC4]" />Investigation, decision and outcome</h3><div className="mt-3 space-y-3"><div className="space-y-1.5"><Label className="text-xs">Investigation findings</Label><Textarea key={`${selected._docId}-findings`} defaultValue={selected.investigationFindings} onBlur={e => { if (e.target.value !== selected.investigationFindings) void saveText("investigationFindings", e.target.value, "Findings"); }} rows={3} placeholder="Evidence checked, driver account, vehicle records, CCTV / telematics, relevant context…" /></div><div className="space-y-1.5"><Label className="text-xs">Decision / proposed action</Label><Textarea key={`${selected._docId}-decision`} defaultValue={selected.decision} onBlur={e => { if (e.target.value !== selected.decision) void saveText("decision", e.target.value, "Decision"); }} rows={2} placeholder="What decision has been reached and why?" /></div><div className="space-y-1.5"><Label className="text-xs">Client response sent / response record</Label><Textarea key={`${selected._docId}-response`} defaultValue={selected.clientResponse} onBlur={e => { if (e.target.value !== selected.clientResponse) void saveText("clientResponse", e.target.value, "Client response"); }} rows={2} placeholder="Record the response sent and when. The SLA monitor will alert the management team if this is outstanding." /></div><section className="relative overflow-hidden rounded-xl border border-[#B9DCEB] bg-gradient-to-br from-[#EEF8FC] via-white to-[#F2F7FF] p-4 shadow-[0_10px_28px_-22px_rgba(30,100,78,0.45)]"><div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-[#4B9FC4] to-[#6F8FE8]" /><h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-[#285D78]"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#DDF2FA] text-[#287CA2]"><Sparkles className="h-3.5 w-3.5" /></span>Cost and financial impact</h3><p className="mt-1 text-[11px] text-[#607486]">Record the original booking revenue, any client refund or credit, and any subcontracted transport cost to show the overall financial result.</p><div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"><div className="min-w-0 space-y-1.5"><Label className="text-xs">Booking revenue (£)</Label><Input className="w-full" key={`${selected._docId}-booking-cost`} type="number" min="0" step="0.01" defaultValue={selected.bookingCost ?? ""} onBlur={e => { const amount = Math.max(0, Number(e.target.value) || 0); if (amount !== Number(selected.bookingCost || 0)) void patchSelected({ bookingCost: amount }, "Original booking revenue saved."); }} placeholder="What Swans charged" /></div><div className="min-w-0 space-y-1.5"><Label className="text-xs">Client refund / credit (£)</Label><Input className="w-full" key={`${selected._docId}-refund`} type="number" min="0" step="0.01" defaultValue={selected.refundAmount ?? 0} onBlur={e => { const amount = Math.max(0, Number(e.target.value) || 0); if (amount !== Number(selected.refundAmount || 0)) void patchSelected({ refundAmount: amount }, "Refund / credit amount saved."); }} placeholder="0.00" /></div><div className="min-w-0 space-y-1.5"><Label className="text-xs">Subcontractor cost (£)</Label><Input className="w-full" key={`${selected._docId}-subcontracted-cost`} type="number" min="0" step="0.01" defaultValue={selected.subcontractedCost ?? 0} onBlur={e => { const amount = Math.max(0, Number(e.target.value) || 0); if (amount !== Number(selected.subcontractedCost || 0)) void patchSelected({ subcontractedCost: amount }, "Subcontracted transport cost saved."); }} placeholder="0.00" /></div></div><div className="mt-3 grid gap-2 sm:grid-cols-3"><div className="rounded-lg border border-[#D8E5EF] bg-white/80 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-[#73879A]">Total refund + subcontract cost</p><p className="mt-1 text-lg font-semibold text-[#263C4B]">{new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(selected.refundAmount || 0) + Number(selected.subcontractedCost || 0))}</p></div><div className="rounded-lg border border-[#D8E5EF] bg-white/80 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-[#73879A]">Original booking revenue</p><p className="mt-1 text-lg font-semibold text-[#263C4B]">{selected.bookingCost == null ? "Not recorded" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(selected.bookingCost)}</p></div><div className="rounded-lg border border-[#B9DCEB] bg-[#EAF5FA] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-[#285D78]">Net after refund and subcontract</p><p className={`mt-1 text-lg font-semibold ${(Number(selected.bookingCost || 0) - Number(selected.refundAmount || 0) - Number(selected.subcontractedCost || 0)) < 0 ? "text-[#B54E42]" : "text-[#216D63]"}`}>{selected.bookingCost == null ? "Add booking revenue" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(Number(selected.bookingCost) - Number(selected.refundAmount || 0) - Number(selected.subcontractedCost || 0))}</p></div></div></section><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label className="text-xs">Root cause (if established)</Label><Input key={`${selected._docId}-cause`} defaultValue={selected.rootCause} onBlur={e => { if (e.target.value !== selected.rootCause) void saveText("rootCause", e.target.value, "Root cause"); }} placeholder="e.g. vehicle defect confirmed / no fault established" /></div><div className="space-y-1.5"><Label className="text-xs">Final outcome *</Label><Input key={`${selected._docId}-outcome`} defaultValue={selected.outcome} onBlur={e => { if (e.target.value !== selected.outcome) void saveText("outcome", e.target.value, "Outcome"); }} placeholder="e.g. Upheld, partially upheld, not substantiated" /></div></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={Boolean(selected.acknowledgedAt)} onClick={() => void acknowledge()}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />{selected.acknowledgedAt ? `Acknowledged ${dateText(selected.acknowledgedAt)}` : "Mark acknowledged"}</Button>{selected.stage !== "closed" ? <Button size="sm" className="bg-[#173B56] hover:bg-[#102C42]" onClick={() => void moveStage("closed")}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Close complaint</Button> : <Badge className="border-0 bg-[#EAF3F9] text-[#286B8D]">Closed {dateText(selected.closedAt)}</Badge>}</div><p className="text-[10px] leading-4 text-[#73879A]">Closing requires an outcome and every task to be complete or formally waived. The record remains available for reporting and repeat-issue reviews.</p></div></section>
          <div className="rounded-xl bg-[#F5F8FB] p-3 text-[10px] leading-5 text-[#73879A]"><FileText className="mr-1 inline h-3.5 w-3.5" />Created by {selected.createdByName} · Last updated {dateText(selected.updatedAt)} · Owner {members.find((member: any) => member.id === selected.ownerTeamMemberId)?.displayName || "Not assigned"}</div>
        </div></Panel></fieldset> : <Panel><EmptyState title="Select a complaint" description="Choose a case from the register to manage its deadlines, investigation, actions and outcome." /></Panel>}</div>
    </div>
    <div className="mt-5 rounded-xl border border-[#D8E5EF] bg-[#F5F9FC] p-4"><div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#43816F]" /><div><p className="text-xs font-semibold text-[#3D5B4F]">How the timers work</p><p className="mt-1 text-[11px] leading-5 text-[#738279]">Deadlines count 09:00–17:00 Monday to Friday, excluding England and Wales bank holidays. Acknowledgement is due within 1 working day and the full response within 5 working days. The background monitor checks hourly during the working day, sends a warning 2 working hours before acknowledgement and 4 working hours before the full response deadline, then sends a separate overdue alert if the deadline is missed. Alerts go to the management team: you, Coral and Stephen. Completed milestones and closed complaints are excluded.</p></div></div></div>
  </div>;
}
