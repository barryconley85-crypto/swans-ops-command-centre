import { useMemo, useState } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelHeading } from "@/components/WorkspacePrimitives";
import { Plus, Search, Download, CalendarClock } from "lucide-react";
import { toast } from "sonner";

const WALKAROUND = "Walkaround Check Refresher";
const dateLabel = (value?: string) => value ? new Date(value + "T12:00:00").toLocaleDateString("en-GB") : "Not recorded";
const addTwoYears = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year + 2, month - 1, day));
  if (date.getUTCMonth() !== month - 1) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
};
const status = (due?: string) => {
  if (!due) return { label: "Missing", tone: "secondary" as const };
  const today = new Date(); today.setHours(0,0,0,0);
  const expiry = new Date(due + "T00:00:00");
  const days = Math.ceil((expiry.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { label: "Overdue", tone: "destructive" as const };
  if (days <= 90) return { label: "Due soon", tone: "outline" as const };
  return { label: "In date", tone: "default" as const };
};

export default function DriverTrainingMatrix() {
  const { state, add } = useWorkspace();
  const drivers = useMemo(() => [...(state.drivers || [])].filter((d:any) => d.active !== false).sort((a:any,b:any) => String(a.name).localeCompare(String(b.name))), [state.drivers]);
  const cpcRecords = state.driverCompliance || [];
  const familiarisations = state.vehicleFamiliarisations || [];
  const refresherRecords = state.driverTrainingRecords || [];
  const [search, setSearch] = useState("");
  const [depot, setDepot] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [driverId, setDriverId] = useState("");
  const [completionDate, setCompletionDate] = useState(new Date().toISOString().slice(0,10));
  const [trainer, setTrainer] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const depots = Array.from(new Set(drivers.map((d:any) => String(d.depotSlug || "Unassigned")))).sort();
  const rows = drivers.map((driver:any) => {
    const cpc = cpcRecords.find((r:any) => (r.driverId && r.driverId === driver._docId) || String(r.driverName || "").toLowerCase() === String(driver.name || "").toLowerCase());
    const vf = familiarisations.filter((r:any) => (r.driverId && r.driverId === driver._docId) || String(r.driverName || "").toLowerCase() === String(driver.name || "").toLowerCase());
    const walk = refresherRecords.filter((r:any) => r.driverId === driver._docId || String(r.driverName || "").toLowerCase() === String(driver.name || "").toLowerCase()).sort((a:any,b:any) => String(b.completionDate || "").localeCompare(String(a.completionDate || "")))[0];
    const walkDue = walk?.completionDate ? addTwoYears(walk.completionDate) : "";
    const evbRecords = vf.filter((record:any) => String(record.vehicleRegistration || "").toUpperCase().includes("EVB"));
    const evbSites = new Set(evbRecords.map((record:any) => record.chargingSite));
    const ffmRecords = vf.filter((record:any) => String(record.vehicleRegistration || "").toUpperCase().includes("FFM"));
    const evChargingDetails = [
      ...(evbRecords.length ? ["EVB charging: Swans " + (evbSites.has("swans") ? "complete" : "outstanding") + " · Alderley Park " + (evbSites.has("alderley-park") ? "complete" : "outstanding")] : []),
      ...(ffmRecords.length ? ["FFM charging: Swans " + (ffmRecords.some((record:any) => record.chargingSite === "swans") ? "complete" : "outstanding")] : [])
    ];
    return { driver, cpc, vf, walk, walkDue, evChargingDetails };
  });
  const filtered = rows.filter((row:any) => {
    const term = search.toLowerCase();
    return (!term || [row.driver.name,row.driver.depotSlug].some((v:any)=>String(v||"").toLowerCase().includes(term))) && (depot === "all" || String(row.driver.depotSlug || "Unassigned") === depot);
  });
  const counts = {
    drivers: filtered.length,
    cpc: filtered.filter((r:any)=>r.cpc?.cpcExpiry && status(r.cpc.cpcExpiry).label === "In date").length,
    vf: filtered.filter((r:any)=>r.vf.length > 0).length,
    walk: filtered.filter((r:any)=>r.walkDue && status(r.walkDue).label === "In date").length
  };
  const saveRefresher = async () => {
    const driver = drivers.find((d:any)=>d._docId === driverId);
    if (!driver || !completionDate || !trainer.trim()) return toast.error("Choose a driver, completion date and trainer.");
    setSaving(true);
    try {
      await add("driverTrainingRecords", { driverId: driver._docId, driverName: driver.name, category: WALKAROUND, completionDate, nextDueDate: addTwoYears(completionDate), trainerName: trainer.trim(), notes: notes.trim(), depotSlug: driver.depotSlug || "" });
      toast.success("Walkaround refresher recorded. Next due date set for two years.");
      setShowForm(false); setDriverId(""); setTrainer(""); setNotes("");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Training record could not be saved."); }
    finally { setSaving(false); }
  };
  const exportCsv = () => {
    const esc = (v:any) => '"' + String(v ?? "").replace(/"/g,'""') + '"';
    const lines = [["Driver","Depot","CPC expiry","CPC status","Familiarisation records","Walkaround completed","Walkaround next due","Walkaround status"], ...filtered.map((r:any)=>[r.driver.name,r.driver.depotSlug||"",r.cpc?.cpcExpiry||"",r.cpc?.cpcApplicability==="not-applicable"?"Not applicable":status(r.cpc?.cpcExpiry).label,r.vf.length,r.walk?.completionDate||"",r.walkDue||"",status(r.walkDue).label])];
    const csv = lines.map(line=>line.map(esc).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a"); a.href=url; a.download="swans-driver-training-matrix.csv"; a.click(); URL.revokeObjectURL(url);
  };
  const Cell = ({item, detail}:{item:any;detail?:string}) => <div className="space-y-1"><Badge variant={item.tone}>{item.label}</Badge>{detail?<p className="text-xs text-muted-foreground">{detail}</p>:null}</div>;
  return <Panel>
    <div className="flex flex-col gap-3 border-b p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><PanelHeading title="Driver training matrix" description="One live view of CPC, vehicle familiarisation and refresher training across active drivers."/><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4"/>Export CSV</Button><Button onClick={()=>setShowForm(v=>!v)} className="bg-[#0B8997] hover:bg-[#08717C]"><Plus className="mr-2 h-4 w-4"/>Record refresher</Button></div></div>
      <div className="grid gap-3 sm:grid-cols-4"><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Drivers shown</p><p className="text-2xl font-semibold">{counts.drivers}</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">CPC in date</p><p className="text-2xl font-semibold">{counts.cpc}</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Familiarised</p><p className="text-2xl font-semibold">{counts.vf}</p></div><div className="rounded-lg bg-muted/40 p-3"><p className="text-xs text-muted-foreground">Walkaround in date</p><p className="text-2xl font-semibold">{counts.walk}</p></div></div>
      {showForm?<div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4"><div className="space-y-2"><Label>Driver</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={driverId} onChange={e=>setDriverId(e.target.value)}><option value="">Choose driver</option>{drivers.map((d:any)=><option key={d._docId} value={d._docId}>{d.name}</option>)}</select></div><div className="space-y-2"><Label>Completion date</Label><Input type="date" value={completionDate} onChange={e=>setCompletionDate(e.target.value)}/></div><div className="space-y-2"><Label>Trainer</Label><Input value={trainer} onChange={e=>setTrainer(e.target.value)} placeholder="Trainer name"/></div><div className="space-y-2"><Label>Notes</Label><Input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes"/></div><div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4"><CalendarClock className="h-4 w-4 text-[#0B8997]"/><span className="text-sm text-muted-foreground">Next refresher due: {completionDate ? dateLabel(addTwoYears(completionDate)) : "Choose a completion date"}</span><div className="ml-auto flex gap-2"><Button variant="outline" onClick={()=>setShowForm(false)}>Cancel</Button><Button disabled={saving} onClick={()=>void saveRefresher()}>{saving?"Saving…":"Save training record"}</Button></div></div></div>:null}
      <div className="grid gap-3 sm:grid-cols-[1fr_220px]"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search driver or depot"/></div><select aria-label="Filter depot" className="h-10 rounded-md border bg-background px-3 text-sm" value={depot} onChange={e=>setDepot(e.target.value)}><option value="all">All depots</option>{depots.map((d:any)=><option key={d} value={d}>{d}</option>)}</select></div>
    </div>
    <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-muted/40 text-muted-foreground"><tr><th className="px-4 py-3">Driver</th><th className="px-4 py-3">Depot</th><th className="px-4 py-3">Driver CPC</th><th className="px-4 py-3">Vehicle familiarisation</th><th className="px-4 py-3">2-year walkaround refresher</th></tr></thead><tbody className="divide-y">{filtered.map((row:any)=><tr key={row.driver._docId}><td className="px-4 py-3 font-medium">{row.driver.name}</td><td className="px-4 py-3">{row.driver.depotSlug||"Unassigned"}</td><td className="px-4 py-3">{row.cpc?.cpcApplicability==="not-applicable"?<Badge variant="secondary">Not applicable</Badge>:<Cell item={status(row.cpc?.cpcExpiry)} detail={row.cpc?.cpcExpiry?"Expires "+dateLabel(row.cpc.cpcExpiry):"No CPC expiry recorded"}/>}</td><td className="px-4 py-3">{row.vf.length?<div><Badge>{row.evChargingDetails.some((detail:string)=>detail.includes("outstanding"))?"Part complete":"Recorded"}</Badge><p className="mt-1 text-xs text-muted-foreground">{row.vf.length} record(s), latest {dateLabel(row.vf.map((v:any)=>v.familiarisationDate).sort().at(-1))}</p>{row.evChargingDetails.map((detail:string)=><p key={detail} className="mt-1 text-xs font-medium text-[#0B8997]">{detail}</p>)}</div>:<Badge variant="secondary">Missing</Badge>}</td><td className="px-4 py-3">{row.walk?<Cell item={status(row.walkDue)} detail={"Completed "+dateLabel(row.walk.completionDate)+", due "+dateLabel(row.walkDue)}/>:<Badge variant="secondary">Missing</Badge>}</td></tr>)}</tbody></table>{filtered.length===0?<p className="p-8 text-center text-sm text-muted-foreground">No active drivers match these filters.</p>:null}</div>
    <p className="border-t p-4 text-xs text-muted-foreground">Status guide: green = in date, amber = due within 90 days, red = overdue, grey = no record. CPC status uses the expiry date held in the existing compliance register. Vehicle familiarisation shows whether a sign-off exists, not a blanket clearance for every vehicle type.</p>
  </Panel>;
}
