import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, onSnapshot, query, updateDoc } from "firebase/firestore";
import { AlertTriangle, Clock3, ExternalLink, FolderOpen, Plus, Save, X } from "lucide-react";
import { firebaseDb } from "@/lib/firebase";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type ExceptionType = "lost" | "stolen" | "damaged" | "malfunctioning";
type ExceptionRecord = {
  _docId: string; driverId: string; driverName: string; depot?: string;
  exceptionType: ExceptionType; unavailableDate: string; reportedDate?: string;
  replacementAppliedDate?: string; replacementReceivedDate?: string; resumedDate?: string;
  replacementEvidenceUrl?: string; printoutsFolderUrl?: string; printoutsConfirmed?: boolean;
  notes?: string; status: "open" | "closed"; createdAt?: number; updatedAt?: number;
};
type Driver = { _docId: string; name: string; depot?: string; active?: boolean };
const today = () => new Date().toISOString().slice(0, 10);
const addCalendarDays = (value: string, days: number) => {
  const [y,m,d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y,m-1,d+days));
  return date.toISOString().slice(0,10);
};
const daysFrom = (value: string) => {
  const [y,m,d] = value.split("-").map(Number);
  const start = Date.UTC(y,m-1,d);
  const now = new Date();
  const current = Date.UTC(now.getFullYear(),now.getMonth(),now.getDate());
  return Math.floor((current-start)/86400000)+1;
};
const labelDate = (value?: string) => value ? new Date(value+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "Not recorded";
const validHttpUrl = (value: string) => {
  try { const url = new URL(value); return url.protocol === "https:" || url.protocol === "http:"; }
  catch { return false; }
};
const emptyForm = () => ({
  driverId:"", exceptionType:"lost" as ExceptionType, unavailableDate:today(), reportedDate:"",
  replacementAppliedDate:"", replacementReceivedDate:"", resumedDate:"",
  replacementEvidenceUrl:"", printoutsFolderUrl:"", printoutsConfirmed:false, notes:""
});
export default function TachoCardExceptions() {
  const { profile, state } = useWorkspace();
  const [records,setRecords] = useState<ExceptionRecord[]>([]);
  const [form,setForm] = useState<ReturnType<typeof emptyForm>|null>(null);
  const [editingId,setEditingId] = useState<string|null>(null);
  const [saving,setSaving] = useState(false);
  const drivers = useMemo(() => ((state.drivers||[]) as Driver[]).filter(d=>d.active!==false).sort((a,b)=>a.name.localeCompare(b.name)),[state.drivers]);
  useEffect(() => {
    if (!firebaseDb) return;
    return onSnapshot(query(collection(firebaseDb,"ops_tacho_card_exceptions")),snap => {
      setRecords(snap.docs.map(item=>({_docId:item.id,...item.data()} as ExceptionRecord)).sort((a,b)=>a.status===b.status ? b.unavailableDate.localeCompare(a.unavailableDate) : a.status==="open"?-1:1));
    }, error => { console.error("[tacho-card-exceptions] load failed",error); toast.error("Tachograph card exception records could not be loaded."); });
  },[]);
  const openRecords = records.filter(r=>r.status==="open");
  const startNew = () => { setEditingId(null); setForm(emptyForm()); };
  const startEdit = (record: ExceptionRecord) => {
    setEditingId(record._docId);
    setForm({...emptyForm(),...record});
  };
  const closeForm = () => { setForm(null); setEditingId(null); };
  const save = async () => {
    if (!firebaseDb || !profile || !form) return;
    const driver = drivers.find(d=>d._docId===form.driverId);
    if (!driver) { toast.error("Select a driver from the driver directory."); return; }
    if (!form.unavailableDate) { toast.error("Enter the date the card became unavailable."); return; }
    if (form.replacementAppliedDate && form.replacementAppliedDate < form.unavailableDate) { toast.error("The replacement application date cannot be before the card became unavailable."); return; }
    if (form.replacementReceivedDate && form.replacementAppliedDate && form.replacementReceivedDate < form.replacementAppliedDate) { toast.error("The replacement received date cannot be before the application date."); return; }
    if (form.resumedDate && form.resumedDate < form.unavailableDate) { toast.error("The normal recording resumption date cannot be before the card became unavailable."); return; }
    if (form.replacementEvidenceUrl && !validHttpUrl(form.replacementEvidenceUrl)) { toast.error("Enter a valid SharePoint evidence URL."); return; }
    if (form.printoutsFolderUrl && !validHttpUrl(form.printoutsFolderUrl)) { toast.error("Enter a valid SharePoint printouts folder URL."); return; }
    const closing = !!form.replacementReceivedDate && !!form.resumedDate;
    if (closing && (!form.replacementEvidenceUrl || !form.printoutsFolderUrl || !form.printoutsConfirmed)) {
      toast.error("Before closing, add both SharePoint evidence links and confirm the daily printouts have been checked.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        driverId:driver._docId, driverName:driver.name, depot:driver.depot||"",
        exceptionType:form.exceptionType, unavailableDate:form.unavailableDate,
        reportedDate:form.reportedDate, replacementAppliedDate:form.replacementAppliedDate,
        replacementReceivedDate:form.replacementReceivedDate, resumedDate:form.resumedDate,
        replacementEvidenceUrl:form.replacementEvidenceUrl.trim(), printoutsFolderUrl:form.printoutsFolderUrl.trim(),
        printoutsConfirmed:!!form.printoutsConfirmed, notes:form.notes.trim(),
        status:closing ? "closed" : "open", updatedAt:Date.now(), updatedBy:profile.displayName||profile.userId
      };
      if (editingId) await updateDoc(doc(firebaseDb,"ops_tacho_card_exceptions",editingId),payload);
      else await addDoc(collection(firebaseDb,"ops_tacho_card_exceptions"),{...payload,createdAt:Date.now(),createdBy:profile.displayName||profile.userId});
      closeForm();
      toast.success(closing ? "Exception closed and audit record retained." : "Tachograph card exception saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Exception could not be saved.");
    } finally { setSaving(false); }
  };
  const countdown = (record: ExceptionRecord) => {
    const elapsed = daysFrom(record.unavailableDate);
    const remaining = 15-elapsed;
    const applicationRemaining = 7-daysFrom(record.unavailableDate)+1;
    const tone = remaining < 0 ? "destructive" : remaining <= 2 ? "destructive" : remaining <= 5 ? "warning" : "success";
    return {elapsed,remaining,applicationRemaining,tone};
  };
  return <section className="mt-6 rounded-2xl border border-[#DCE7EF] bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-[#168B91]"/><h2 className="font-semibold text-[#17384F]">Tachograph card exceptions</h2></div><p className="mt-1 max-w-3xl text-xs text-[#71879A]">Track lost, stolen, damaged or malfunctioning cards, the replacement application, the temporary exception countdown and supporting SharePoint records.</p></div>
      <Button onClick={startNew} size="sm"><Plus className="mr-2 h-4 w-4"/>Record exception</Button>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-[#DCE7EF] bg-[#F6FAFC] p-3"><div className="text-xs text-[#71879A]">Open exceptions</div><div className="mt-1 text-2xl font-semibold text-[#17384F]">{openRecords.length}</div></div>
      <div className="rounded-xl border border-[#DCE7EF] bg-[#F6FAFC] p-3"><div className="text-xs text-[#71879A]">Application deadline approaching</div><div className="mt-1 text-2xl font-semibold text-[#17384F]">{openRecords.filter(r=>countdown(r).applicationRemaining<=2 && countdown(r).applicationRemaining>=0 && !r.replacementAppliedDate).length}</div></div>
      <div className="rounded-xl border border-[#DCE7EF] bg-[#F6FAFC] p-3"><div className="text-xs text-[#71879A]">15-day allowance exceeded</div><div className="mt-1 text-2xl font-semibold text-rose-700">{openRecords.filter(r=>countdown(r).remaining<0).length}</div></div>
    </div>
    {form && <div className="mt-5 rounded-xl border border-[#B8D4E2] bg-[#F8FBFD] p-4">
      <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-[#17384F]">{editingId?"Update exception":"New tachograph card exception"}</h3><Button variant="ghost" size="icon" onClick={closeForm}><X className="h-4 w-4"/></Button></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div><Label>Driver</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={form.driverId} onChange={e=>setForm({...form,driverId:e.target.value})}><option value="">Select driver</option>{drivers.map(d=><option key={d._docId} value={d._docId}>{d.name}</option>)}</select></div>
        <div><Label>Reason</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={form.exceptionType} onChange={e=>setForm({...form,exceptionType:e.target.value as ExceptionType})}><option value="lost">Lost</option><option value="stolen">Stolen</option><option value="damaged">Damaged</option><option value="malfunctioning">Malfunctioning</option></select></div>
        <div><Label>Date card became unavailable</Label><Input className="mt-1" type="date" value={form.unavailableDate} onChange={e=>setForm({...form,unavailableDate:e.target.value})}/></div>
        <div><Label>Date reported to DVLA / police as applicable</Label><Input className="mt-1" type="date" value={form.reportedDate} onChange={e=>setForm({...form,reportedDate:e.target.value})}/></div>
        <div><Label>Replacement applied for</Label><Input className="mt-1" type="date" value={form.replacementAppliedDate} onChange={e=>setForm({...form,replacementAppliedDate:e.target.value})}/></div>
        <div><Label>Replacement card received</Label><Input className="mt-1" type="date" value={form.replacementReceivedDate} onChange={e=>setForm({...form,replacementReceivedDate:e.target.value})}/></div>
        <div><Label>Normal card recording resumed</Label><Input className="mt-1" type="date" value={form.resumedDate} onChange={e=>setForm({...form,resumedDate:e.target.value})}/></div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><Label>Replacement order confirmation, SharePoint link</Label><Input className="mt-1" type="url" placeholder="Paste SharePoint file or folder link" value={form.replacementEvidenceUrl} onChange={e=>setForm({...form,replacementEvidenceUrl:e.target.value})}/></div>
        <div><Label>Scanned daily printouts folder, SharePoint link</Label><Input className="mt-1" type="url" placeholder="Paste SharePoint folder link" value={form.printoutsFolderUrl} onChange={e=>setForm({...form,printoutsFolderUrl:e.target.value})}/></div>
      </div>
      <label className="mt-4 flex items-start gap-2 text-sm text-[#36546A]"><input type="checkbox" className="mt-1" checked={form.printoutsConfirmed} onChange={e=>setForm({...form,printoutsConfirmed:e.target.checked})}/><span><strong>Daily printouts checked and scanned</strong><span className="block text-xs text-[#71879A]">Confirm the required signed printouts and manual activity records have been checked and stored.</span></span></label>
      <div className="mt-3"><Label>Notes / follow-up</Label><textarea className="mt-1 min-h-20 w-full rounded-md border border-input bg-white px-3 py-2 text-sm" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Record dates, actions taken and any missing evidence."/></div>
      <div className="mt-4 flex flex-wrap gap-2"><Button disabled={saving} onClick={()=>void save()}><Save className="mr-2 h-4 w-4"/>{saving?"Saving…":"Save exception"}</Button><Button variant="outline" onClick={closeForm}>Cancel</Button></div>
      <p className="mt-3 text-xs text-[#71879A]">The record remains open until a replacement is received, normal recording has resumed, and both evidence links plus the printout check are completed.</p>
    </div>}
    <div className="mt-5 space-y-3">
      {records.map(record=>{const timer=countdown(record);const appDue=addCalendarDays(record.unavailableDate,6);const timerLabel=timer.remaining<0?"15-day period exceeded":timer.remaining===0?"Day 15, final day":timer.remaining+" days remaining";const color=timer.remaining<0||timer.remaining<=2?"border-rose-300 bg-rose-50":timer.remaining<=5?"border-amber-300 bg-amber-50":"border-emerald-200 bg-emerald-50";return <article key={record._docId} className="rounded-xl border border-[#DCE7EF] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-[#17384F]">{record.driverName}</h3><Badge variant={record.status==="closed"?"secondary":"outline"}>{record.status==="closed"?"Closed":"Open"}</Badge><Badge variant="outline">{record.exceptionType}</Badge></div><p className="mt-1 text-xs text-[#71879A]">Card unavailable: {labelDate(record.unavailableDate)} · Reported: {labelDate(record.reportedDate)} · Replacement applied: {labelDate(record.replacementAppliedDate)}</p></div><Button variant="outline" size="sm" onClick={()=>startEdit(record)}>Manage</Button></div>
        {record.status==="open" && <div className={"mt-3 rounded-lg border p-3 "+color}><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-xs font-medium text-[#526C80]">15-calendar-day exception countdown</div><div className="mt-1 text-xl font-semibold text-[#17384F]">{timerLabel}</div></div><div className="text-right text-xs text-[#526C80]">Day {Math.max(1,timer.elapsed)} of 15<br/>Deadline: {labelDate(addCalendarDays(record.unavailableDate,14))}</div></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80"><div className={"h-full rounded-full "+(timer.remaining<=2?"bg-rose-600":timer.remaining<=5?"bg-amber-500":"bg-emerald-600")} style={{width:Math.max(0,Math.min(100,(Math.max(0,15-timer.elapsed)/15)*100))+"%"}}/></div>
          {!record.replacementAppliedDate && <p className={"mt-2 flex items-center gap-1 text-xs "+(timer.applicationRemaining<=0?"font-semibold text-rose-700":timer.applicationRemaining<=2?"font-semibold text-amber-700":"text-[#526C80]")}><AlertTriangle className="h-3.5 w-3.5"/>Replacement application: {timer.applicationRemaining<0?"7-day application deadline passed":timer.applicationRemaining===0?"Apply by today":"Apply within "+timer.applicationRemaining+" day(s)"} (target date {labelDate(appDue)})</p>}
        </div>}
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div className="flex items-center gap-2"><FolderOpen className="h-4 w-4 text-[#168B91]"/>{record.replacementEvidenceUrl?<a className="text-sky-700 underline" href={record.replacementEvidenceUrl} target="_blank" rel="noreferrer">Open replacement evidence <ExternalLink className="inline h-3 w-3"/></a>:<span className="text-amber-700">Replacement evidence link missing</span>}</div><div className="flex items-center gap-2"><FolderOpen className="h-4 w-4 text-[#168B91]"/>{record.printoutsFolderUrl?<a className="text-sky-700 underline" href={record.printoutsFolderUrl} target="_blank" rel="noreferrer">Open daily printouts folder <ExternalLink className="inline h-3 w-3"/></a>:<span className="text-amber-700">Printouts folder link missing</span>}</div></div>
        <div className="mt-2 text-xs text-[#71879A]">Printouts checked: {record.printoutsConfirmed?"Yes":"Not yet confirmed"} · Replacement received: {labelDate(record.replacementReceivedDate)} · Normal recording resumed: {labelDate(record.resumedDate)}</div>
        {record.notes&&<p className="mt-2 whitespace-pre-wrap text-sm text-[#526C80]">{record.notes}</p>}
      </article>})}
      {!records.length&&<div className="rounded-xl border border-dashed border-[#DCE7EF] p-8 text-center text-sm text-[#71879A]">No tachograph card exceptions have been recorded.</div>}
    </div>
    <p className="mt-4 text-xs text-[#71879A]">Countdowns are calendar-day prompts for record keeping, not authorisation to drive. The statutory exception only applies where the specific legal conditions are met. A driver must follow the required printout and manual-recording procedure throughout.</p>
  </section>;
}
