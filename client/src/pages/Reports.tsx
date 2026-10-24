import { useAuth } from "@/_core/hooks/useAuth";
import { EmptyState, LoadError, PageHeader, Panel, PanelHeading } from "@/components/WorkspacePrimitives";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { buildOperationalReport, reportDefinitions } from "@/lib/operationalReports";
import { localDateKey } from "@/lib/operations";
import { addDays } from "date-fns";
import { BarChart3, ChevronDown, Download, FileBarChart, Save, ShieldCheck, MessageSquareWarning, Mail } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const escapeCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export default function Reports() {
  const { user } = useAuth();
  const workspace = useWorkspace();
  const today = localDateKey();
  const [reportId, setReportId] = useState("risk-radar");
  const [rangeStart, setRangeStart] = useState(localDateKey(addDays(new Date(), -6)));
  const [rangeEnd, setRangeEnd] = useState(today);
  const [memberId, setMemberId] = useState("");
  const [taskStatus, setTaskStatus] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState("");
  const [showComplaintsReport, setShowComplaintsReport] = useState(false);
  const complaints = useMemo(() => ((workspace.state.complaints || []) as any[]).filter(item => item.recordType === "complaint"), [workspace.state.complaints]);
  const complaintRows = useMemo(() => {
    const from = new Date(`${rangeStart}T00:00:00`).getTime();
    const to = new Date(`${rangeEnd}T23:59:59.999`).getTime();
    return complaints.filter(item => Number(item.receivedAt || item.createdAt || 0) >= from && Number(item.receivedAt || item.createdAt || 0) <= to).sort((a, b) => Number(b.receivedAt || 0) - Number(a.receivedAt || 0));
  }, [complaints, rangeStart, rangeEnd]);
  const complaintPatterns = (field: "driverName" | "vehicle") => {
    const counts = new Map<string, number>();
    complaintRows.forEach(item => { const value = String(item[field] || "").trim(); if (value) counts.set(value, (counts.get(value) || 0) + 1); });
    return [...counts.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1]);
  };
  const complaintDrivers = complaintPatterns("driverName");
  const complaintVehicles = complaintPatterns("vehicle");
  const complaintRefundTotal = complaintRows.reduce((sum, item) => sum + Math.max(0, Number(item.refundAmount || 0)), 0);
  const complaintFinancialPending = complaintRows.filter(item => ["pending_approval", "approved"].includes(String(item.financialStatus || ""))).length;
  const complaintFinancialIssued = complaintRows.filter(item => String(item.financialStatus || "") === "issued").length;
  const complaintClosed = complaintRows.filter(item => item.stage === "closed").length;
  const complaintOverdue = complaintRows.filter(item => item.stage !== "closed" && ((!item.acknowledgedAt && Date.now() > Number(item.acknowledgementDueAt || 0)) || (!String(item.clientResponse || "").trim() && Date.now() > Number(item.responseDueAt || 0)))).length;
  const complaintEmail = () => {
    const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
    const prettyDate = (value: string) => {
      const date = new Date(`${value}T00:00:00`);
      return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    };
    const statusLabel = (value: unknown) => ({
      none: "No refund recorded",
      pending_approval: "Awaiting approval",
      approved: "Approved — not yet confirmed as paid",
      issued: "Issued",
      declined: "Declined"
    }[String(value || "none")] || String(value));
    const lines = [
      "SWANS TRAVEL | WEEKLY COMPLAINTS MANAGEMENT REPORT",
      `Reporting period: ${prettyDate(rangeStart)} – ${prettyDate(rangeEnd)}`,
      `Prepared: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`,
      "",
      "1. EXECUTIVE SUMMARY",
      `• Complaints logged in period: ${complaintRows.length}`,
      `• Still open: ${complaintRows.length - complaintClosed}`,
      `• Closed: ${complaintClosed}`,
      `• Overdue acknowledgement / response: ${complaintOverdue}`,
      `• Total refund / credit value recorded: ${money.format(complaintRefundTotal)}`,
      `• Awaiting approval or approved: ${complaintFinancialPending} case(s)`,
      `• Marked as issued: ${complaintFinancialIssued} case(s)`,
      "",
      "2. ITEMS FOR MANAGEMENT ATTENTION",
      ...(complaintOverdue ? [`• ${complaintOverdue} complaint(s) show an overdue acknowledgement or response and should be reviewed.`] : ["• No overdue acknowledgement / response is flagged in the records for this period."]),
      ...((complaintRows.length - complaintClosed) ? [`• ${complaintRows.length - complaintClosed} complaint(s) remain open; confirm an owner and next action for each.`] : ["• All complaints logged in this period are marked closed."]),
      ...(complaintFinancialPending ? [`• Check approval / payment progress for ${complaintFinancialPending} refund or credit case(s).`] : []),
      "",
      "3. REPEAT PATTERNS TO REVIEW",
      "Driver links (repeat appearances only):",
      ...(complaintDrivers.length ? complaintDrivers.map(([name, count]) => `• ${name}: ${count} complaints`) : ["• No repeat driver links identified in this period."]),
      "Vehicle links (repeat appearances only):",
      ...(complaintVehicles.length ? complaintVehicles.map(([name, count]) => `• ${name}: ${count} complaints`) : ["• No repeat vehicle links identified in this period."]),
      "These are patterns for management review, not findings of fault.",
      "",
      "4. REFUNDS / CREDITS",
      `• Total value recorded against complaints: ${money.format(complaintRefundTotal)}`,
      `• Pending approval or approved: ${complaintFinancialPending} case(s)`,
      `• Marked as issued: ${complaintFinancialIssued} case(s)`,
      "Note: the total is the value recorded on complaint records; it is not necessarily the amount paid during this reporting period.",
      "",
      "5. COMPLAINT REGISTER",
      ...(complaintRows.length ? complaintRows.map((item, index) => [
        `${index + 1}. ${item.reference || "Reference not recorded"} — ${item.title || "Complaint title not recorded"}`,
        `   Client: ${item.client || "Not recorded"} | Received: ${item.receivedAt ? new Date(item.receivedAt).toLocaleDateString("en-GB") : "Not recorded"}`,
        `   Driver: ${item.driverName || "Not recorded"} | Vehicle: ${item.vehicle || "Not recorded"}`,
        `   Stage: ${item.stage || "Received"} | Outcome: ${item.outcome || item.decision || "Not recorded"}`,
        `   Financial status: ${statusLabel(item.financialStatus)} | Refund / credit value: ${money.format(Number(item.refundAmount || 0))}`,
        item.financialNote ? `   Financial note: ${item.financialNote}` : "",
      ].filter(Boolean).join("\n")) : ["No complaints were logged in the selected reporting period."]),
      "",
      "REPORTING NOTES",
      "This summary is based on information recorded in the Swans Travel Ops Command Centre for the selected dates. Missing outcomes, driver / vehicle details or financial fields have not been assumed. Review the underlying records before making decisions."
    ];
    window.location.href = `mailto:${encodeURIComponent(user?.email || "")}?subject=${encodeURIComponent(`MD Weekly Complaints Report | ${rangeStart} to ${rangeEnd}`)}&body=${encodeURIComponent(lines.join("\n"))}`;
  };
  const report = useMemo(() => buildOperationalReport(reportId, workspace.state, { rangeStart, rangeEnd, memberId: user?.isSuperuser && memberId ? Number(memberId) : null, taskStatus: user?.isSuperuser && taskStatus ? taskStatus : null }), [reportId, workspace.state, rangeStart, rangeEnd, user?.isSuperuser, memberId, taskStatus]);
  const grouped = useMemo(() => reportDefinitions.reduce<Record<string, typeof reportDefinitions>>((all, definition) => ({ ...all, [definition.category]: [...(all[definition.category] || []), definition] }), {}), []);
  const savedViews = (workspace.state.reportViews || []).filter((view: any) => view.ownerUserId === workspace.authUser?.uid);

  const exportCsv = () => {
    const csv = [report.columns.map(escapeCell).join(","), ...report.rows.map(row => report.columns.map(column => escapeCell(row[column])).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const download = document.createElement("a");
    download.href = url; download.download = `swans-ops-${report.id}-${rangeStart}-to-${rangeEnd}.csv`; download.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  };
  const saveView = async () => {
    if (!viewName.trim()) return toast.error("Give the saved report view a clear name.");
    try {
      await workspace.add("reportViews", { id: Date.now(), name: viewName.trim(), reportId, rangeStart, rangeEnd, memberId: memberId || null, taskStatus: taskStatus || null, ownerUserId: workspace.authUser?.uid || "" });
      setViewName(""); setSaveOpen(false); toast.success("Saved report view added.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "The saved report view could not be created."); }
  };
  if (!user?.canRunReports) return <LoadError message="Your workspace role does not have access to operational reports." onRetry={() => void workspace.refresh()} />;
  if (workspace.error) return <LoadError message="Operational reports could not be loaded. No operational data has been changed." onRetry={() => void workspace.refresh()} />;

  return <div className="mx-auto max-w-[1500px] pb-10"><PageHeader eyebrow="Operational intelligence" title="Report centre" description="Run live operational reports across work control, cover, continuity and team support. Every result states what has been recorded; it is not a substitute for operational judgement." actions={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={exportCsv} className="border-[#DCE6E0] bg-white"><Download className="mr-2 h-4 w-4" />Export CSV</Button>{user.isSuperuser ? <Dialog open={saveOpen} onOpenChange={setSaveOpen}><DialogTrigger asChild><Button className="bg-[#1D5C63] hover:bg-[#164B50]"><Save className="mr-2 h-4 w-4" />Save view</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>Save this report view</DialogTitle><DialogDescription>Only the operations lead can save reusable report configurations.</DialogDescription></DialogHeader><div className="space-y-2 py-2"><Label>View name</Label><Input value={viewName} onChange={event => setViewName(event.target.value)} placeholder="Friday operations review" /></div><DialogFooter><Button onClick={saveView} className="bg-[#1D5C63] hover:bg-[#164B50]">Save view</Button></DialogFooter></DialogContent></Dialog> : null}</div>} />
    <section className="mb-5 rounded-2xl border border-[#DFE8E3] bg-white p-4 shadow-[0_15px_34px_-30px_rgba(18,48,41,0.5)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EAF3EF] text-[#1E6258]"><MessageSquareWarning className="h-5 w-5" /></span><div><h2 className="text-sm font-semibold text-[#263630]">Complaints reports</h2><p className="mt-1 text-xs leading-5 text-[#6C7872]">Weekly management summary with repeat driver and vehicle patterns, complaint outcomes and refund / credit exposure for the selected date range.</p></div></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" className="border-[#DCE6E0] bg-white" onClick={() => setShowComplaintsReport(value => !value)}>{showComplaintsReport ? "Hide report" : "View complaints report"}</Button><Button className="bg-[#1D5C63] hover:bg-[#164B50]" onClick={complaintEmail}><Mail className="mr-2 h-4 w-4" />Email weekly summary</Button></div>
      </div>
      {showComplaintsReport ? <div className="mt-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[{label:"Received in period",value:complaintRows.length},{label:"Still open",value:complaintRows.length-complaintClosed},{label:"Closed",value:complaintClosed},{label:"Overdue",value:complaintOverdue},{label:"Refunds / credits",value:new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(complaintRefundTotal)}].map(card => <div key={card.label} className="rounded-xl border border-[#E6ECE8] bg-[#F8FBF9] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-[#78857F]">{card.label}</p><p className="mt-2 text-xl font-semibold text-[#263630]">{card.value}</p></div>)}
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-[#E6ECE8] p-4"><h3 className="text-sm font-semibold text-[#30423A]">Repeat driver patterns</h3>{complaintDrivers.length ? <ul className="mt-3 space-y-2">{complaintDrivers.map(([name,count]) => <li key={name} className="flex justify-between gap-3 text-sm"><span>{name}</span><strong>{count} complaints</strong></li>)}</ul> : <p className="mt-3 text-xs text-[#78857F]">No repeat driver links in this period.</p>}</div>
          <div className="rounded-xl border border-[#E6ECE8] p-4"><h3 className="text-sm font-semibold text-[#30423A]">Repeat vehicle patterns</h3>{complaintVehicles.length ? <ul className="mt-3 space-y-2">{complaintVehicles.map(([name,count]) => <li key={name} className="flex justify-between gap-3 text-sm"><span>{name}</span><strong>{count} complaints</strong></li>)}</ul> : <p className="mt-3 text-xs text-[#78857F]">No repeat vehicle links in this period.</p>}</div>
        </div>
        <div className="mt-5 overflow-x-auto rounded-xl border border-[#E6ECE8]"><table className="min-w-full text-left"><thead className="bg-[#F8FBF9]"><tr>{["Reference","Received","Client","Driver","Vehicle","Stage","Outcome","Financial status","Refund / credit"].map(label => <th key={label} className="whitespace-nowrap px-3 py-3 text-[10px] font-bold uppercase tracking-wide text-[#78857F]">{label}</th>)}</tr></thead><tbody className="divide-y divide-[#EDF0EE]">{complaintRows.map((item,index) => <tr key={item._docId || item.reference || index}>{[item.reference || "—",item.receivedAt ? new Date(item.receivedAt).toLocaleDateString("en-GB") : "—",item.client || "—",item.driverName || "—",item.vehicle || "—",item.stage || "received",item.outcome || item.decision || "Not recorded",item.financialStatus || "none",new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP"}).format(Number(item.refundAmount || 0))].map((value,i) => <td key={i} className="whitespace-nowrap px-3 py-3 text-xs text-[#46544E]">{String(value)}</td>)}</tr>)}</tbody></table>{!complaintRows.length ? <p className="px-4 py-8 text-center text-sm text-[#78857F]">No complaints were received during this period.</p> : null}</div>
        <p className="mt-3 text-[11px] leading-5 text-[#78857F]">Use the date range above to select the reporting week. Repeat links are prompts for management review, not findings of fault. The email button opens a pre-filled email to your signed-in address; review it and press Send in your mail app.</p>
      </div> : null}
    </section>
    <section className="grid gap-5 xl:grid-cols-[315px_minmax(0,1fr)]"><aside className="rounded-2xl border border-[#DFE8E3] bg-white p-4 shadow-[0_15px_34px_-30px_rgba(18,48,41,0.5)]"><div className="flex items-center gap-2 border-b border-[#EDF0EE] pb-3"><BarChart3 className="h-4 w-4 text-[#337366]" /><p className="text-sm font-semibold text-[#30423A]">Available reports</p></div><div className="mt-3 space-y-4">{Object.entries(grouped).map(([category, definitions]) => <div key={category}><p className="px-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#839089]">{category}</p><div className="mt-1 space-y-1">{definitions.map(definition => <button key={definition.id} onClick={() => setReportId(definition.id)} className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${reportId === definition.id ? "bg-[#EAF3EF] text-[#1E6258]" : "text-[#57645E] hover:bg-[#F4F7F5]"}`}><span className="block text-xs font-semibold">{definition.label}</span><span className="mt-0.5 block text-[10px] leading-4 opacity-75">{definition.description}</span></button>)}</div></div>)}</div></aside>
      <div className="min-w-0"><section className={`grid gap-3 rounded-2xl border border-[#E0E7E2] bg-white p-4 shadow-[0_15px_34px_-30px_rgba(18,48,41,0.45)] ${user.isSuperuser ? "md:grid-cols-5" : "sm:grid-cols-[1fr_1fr_auto]"}`}><div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-[0.11em] text-[#78857F]">From</Label><Input type="date" value={rangeStart} max={rangeEnd} onChange={event => setRangeStart(event.target.value)} /></div><div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-[0.11em] text-[#78857F]">To</Label><Input type="date" value={rangeEnd} min={rangeStart} onChange={event => setRangeEnd(event.target.value)} /></div>{user.isSuperuser ? <><div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-[0.11em] text-[#78857F]">Person filter</Label><select value={memberId} onChange={event => setMemberId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">All colleagues</option>{(workspace.state.members || []).filter((member: any) => member.status === "active").map((member: any) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></div><div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-[0.11em] text-[#78857F]">Task status</Label><select value={taskStatus} onChange={event => setTaskStatus(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">All task states</option><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="complete">Complete</option></select></div></> : null}<div className="flex items-end"><Button variant="outline" className="w-full border-[#DCE6E0] bg-[#FBFCFB]" onClick={() => { setRangeStart(localDateKey(addDays(new Date(), -6))); setRangeEnd(today); setMemberId(""); setTaskStatus(""); }}>Reset filters</Button></div></section>
        {user.isSuperuser && savedViews.length ? <section className="mt-4 rounded-2xl border border-[#E1E7E3] bg-[#F8FBF9] p-4"><div className="flex items-center gap-2"><FileBarChart className="h-4 w-4 text-[#3D7D6A]" /><p className="text-sm font-semibold text-[#385147]">Saved report views</p></div><div className="mt-3 flex flex-wrap gap-2">{savedViews.map((view: any) => <Button key={view.id} variant="outline" size="sm" className="border-[#DDE7E1] bg-white" onClick={() => { setReportId(view.reportId); setRangeStart(view.rangeStart); setRangeEnd(view.rangeEnd); setMemberId(view.memberId ? String(view.memberId) : ""); setTaskStatus(view.taskStatus || ""); }}>{view.name}</Button>)}</div></section> : null}
        <section className="mt-5 overflow-hidden rounded-2xl border border-[#E0E7E2] bg-white shadow-[0_18px_38px_-32px_rgba(18,48,41,0.48)]"><div className="border-b border-[#E9EEEA] px-5 py-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF3EF] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.11em] text-[#2B6F61]"><ShieldCheck className="h-3 w-3" />{report.category}</span><h2 className="mt-3 text-xl font-semibold tracking-tight text-[#263630]">{report.label}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-[#6C7872]">{report.description}</p></div><span className="shrink-0 rounded-xl bg-[#F2F6F4] px-3 py-2 text-xs font-semibold text-[#55675F]">{report.rows.length} result{report.rows.length === 1 ? "" : "s"}</span></div></div>{report.rows.length ? <div className="overflow-x-auto"><table className="min-w-full text-left"><thead className="bg-[#FAFBFA]"><tr>{report.columns.map(column => <th key={column} className="whitespace-nowrap px-5 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-[#7A8780]">{column}</th>)}</tr></thead><tbody className="divide-y divide-[#EDF0EE]">{report.rows.map((row, index) => <tr key={`${report.id}-${index}`}>{report.columns.map(column => <td key={column} className="whitespace-nowrap px-5 py-3.5 text-sm text-[#46544E]">{String(row[column] ?? "—")}</td>)}</tr>)}</tbody></table></div> : <EmptyState title="No matching records" description={report.emptyMessage} />}</section>
        <p className="mt-4 rounded-xl border border-[#E1E9E4] bg-[#F8FBF9] px-4 py-3 text-xs leading-5 text-[#61716A]"><ChevronDown className="mr-1 inline h-3.5 w-3.5 text-[#498171]" /><strong>Interpret with context:</strong> this report reflects records in the Command Centre only. In particular, low recorded activity can indicate unlogged work, leave or a different operational priority—not a performance finding.</p>
      </div></section>
  </div>;
}
