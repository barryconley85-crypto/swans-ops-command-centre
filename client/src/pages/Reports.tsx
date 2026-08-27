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
import { BarChart3, ChevronDown, Download, FileBarChart, Save, ShieldCheck } from "lucide-react";
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
    <section className="grid gap-5 xl:grid-cols-[315px_minmax(0,1fr)]"><aside className="rounded-2xl border border-[#DFE8E3] bg-white p-4 shadow-[0_15px_34px_-30px_rgba(18,48,41,0.5)]"><div className="flex items-center gap-2 border-b border-[#EDF0EE] pb-3"><BarChart3 className="h-4 w-4 text-[#337366]" /><p className="text-sm font-semibold text-[#30423A]">Available reports</p></div><div className="mt-3 space-y-4">{Object.entries(grouped).map(([category, definitions]) => <div key={category}><p className="px-2 text-[10px] font-bold uppercase tracking-[0.13em] text-[#839089]">{category}</p><div className="mt-1 space-y-1">{definitions.map(definition => <button key={definition.id} onClick={() => setReportId(definition.id)} className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${reportId === definition.id ? "bg-[#EAF3EF] text-[#1E6258]" : "text-[#57645E] hover:bg-[#F4F7F5]"}`}><span className="block text-xs font-semibold">{definition.label}</span><span className="mt-0.5 block text-[10px] leading-4 opacity-75">{definition.description}</span></button>)}</div></div>)}</div></aside>
      <div className="min-w-0"><section className={`grid gap-3 rounded-2xl border border-[#E0E7E2] bg-white p-4 shadow-[0_15px_34px_-30px_rgba(18,48,41,0.45)] ${user.isSuperuser ? "md:grid-cols-5" : "sm:grid-cols-[1fr_1fr_auto]"}`}><div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-[0.11em] text-[#78857F]">From</Label><Input type="date" value={rangeStart} max={rangeEnd} onChange={event => setRangeStart(event.target.value)} /></div><div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-[0.11em] text-[#78857F]">To</Label><Input type="date" value={rangeEnd} min={rangeStart} onChange={event => setRangeEnd(event.target.value)} /></div>{user.isSuperuser ? <><div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-[0.11em] text-[#78857F]">Person filter</Label><select value={memberId} onChange={event => setMemberId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">All colleagues</option>{(workspace.state.members || []).filter((member: any) => member.status === "active").map((member: any) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></div><div className="space-y-1.5"><Label className="text-[10px] uppercase tracking-[0.11em] text-[#78857F]">Task status</Label><select value={taskStatus} onChange={event => setTaskStatus(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">All task states</option><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="complete">Complete</option></select></div></> : null}<div className="flex items-end"><Button variant="outline" className="w-full border-[#DCE6E0] bg-[#FBFCFB]" onClick={() => { setRangeStart(localDateKey(addDays(new Date(), -6))); setRangeEnd(today); setMemberId(""); setTaskStatus(""); }}>Reset filters</Button></div></section>
        {user.isSuperuser && savedViews.length ? <section className="mt-4 rounded-2xl border border-[#E1E7E3] bg-[#F8FBF9] p-4"><div className="flex items-center gap-2"><FileBarChart className="h-4 w-4 text-[#3D7D6A]" /><p className="text-sm font-semibold text-[#385147]">Saved report views</p></div><div className="mt-3 flex flex-wrap gap-2">{savedViews.map((view: any) => <Button key={view.id} variant="outline" size="sm" className="border-[#DDE7E1] bg-white" onClick={() => { setReportId(view.reportId); setRangeStart(view.rangeStart); setRangeEnd(view.rangeEnd); setMemberId(view.memberId ? String(view.memberId) : ""); setTaskStatus(view.taskStatus || ""); }}>{view.name}</Button>)}</div></section> : null}
        <section className="mt-5 overflow-hidden rounded-2xl border border-[#E0E7E2] bg-white shadow-[0_18px_38px_-32px_rgba(18,48,41,0.48)]"><div className="border-b border-[#E9EEEA] px-5 py-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF3EF] px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.11em] text-[#2B6F61]"><ShieldCheck className="h-3 w-3" />{report.category}</span><h2 className="mt-3 text-xl font-semibold tracking-tight text-[#263630]">{report.label}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-[#6C7872]">{report.description}</p></div><span className="shrink-0 rounded-xl bg-[#F2F6F4] px-3 py-2 text-xs font-semibold text-[#55675F]">{report.rows.length} result{report.rows.length === 1 ? "" : "s"}</span></div></div>{report.rows.length ? <div className="overflow-x-auto"><table className="min-w-full text-left"><thead className="bg-[#FAFBFA]"><tr>{report.columns.map(column => <th key={column} className="whitespace-nowrap px-5 py-3 text-[10px] font-bold uppercase tracking-[0.1em] text-[#7A8780]">{column}</th>)}</tr></thead><tbody className="divide-y divide-[#EDF0EE]">{report.rows.map((row, index) => <tr key={`${report.id}-${index}`}>{report.columns.map(column => <td key={column} className="whitespace-nowrap px-5 py-3.5 text-sm text-[#46544E]">{String(row[column] ?? "—")}</td>)}</tr>)}</tbody></table></div> : <EmptyState title="No matching records" description={report.emptyMessage} />}</section>
        <p className="mt-4 rounded-xl border border-[#E1E9E4] bg-[#F8FBF9] px-4 py-3 text-xs leading-5 text-[#61716A]"><ChevronDown className="mr-1 inline h-3.5 w-3.5 text-[#498171]" /><strong>Interpret with context:</strong> this report reflects records in the Command Centre only. In particular, low recorded activity can indicate unlogged work, leave or a different operational priority—not a performance finding.</p>
      </div></section>
  </div>;
}
