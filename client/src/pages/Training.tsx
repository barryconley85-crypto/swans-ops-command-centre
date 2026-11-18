import { useMemo, useState, type FormEvent } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadError, PageHeader, Panel, PanelHeading } from "@/components/WorkspacePrimitives";
import { Printer, Search } from "lucide-react";
import { toast } from "sonner";
import DriverTrainingMatrix from "@/pages/DriverTrainingMatrix";

export default function Training() {
  const { profile, state, add, patch, remove, refresh } = useWorkspace();
  const canManage = ["lead", "manager"].includes(profile?.memberRole || "");
  const catalog = useMemo(() => [...(state.vehicleFamiliarisationVehicles || [])].sort((a: any, b: any) => String(a.vehicleType).localeCompare(String(b.vehicleType))), [state.vehicleFamiliarisationVehicles]);
  const records = useMemo(() => [...(state.vehicleFamiliarisations || [])].sort((a: any, b: any) => String(b.familiarisationDate || "").localeCompare(String(a.familiarisationDate || ""))), [state.vehicleFamiliarisations]);
  const [vehicleType, setVehicleType] = useState("Overdeck VIP");
  const [registrationList, setRegistrationList] = useState("X17, FUM, V18, X20");
  const [editingId, setEditingId] = useState("");
  const [editType, setEditType] = useState("");
  const [editRegistrations, setEditRegistrations] = useState("");
  const [search, setSearch] = useState("");
  const [reportCategory, setReportCategory] = useState("all");
  const [reportRegistration, setReportRegistration] = useState("all");
  const [saving, setSaving] = useState(false);
  const filteredRecords = records.filter((row: any) => {
    const matchesSearch = !search || [row.driverName, row.vehicleType, row.vehicleRegistration].some(value => String(value || "").toLowerCase().includes(search.toLowerCase()));
    const matchesCategory = reportCategory === "all" || String(row.vehicleType || "") === reportCategory;
    const matchesRegistration = reportRegistration === "all" || String(row.vehicleRegistration || "").toUpperCase() === reportRegistration;
    return matchesSearch && matchesCategory && matchesRegistration;
  });
  const printClearanceReport = () => {
    if (!filteredRecords.length) return toast.error("There are no completed familiarisation records matching these filters.");
    const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character] || character));
    const byDriver = new Map<string, any[]>();
    for (const record of filteredRecords) {
      const key = String(record.driverId || record.driverName || "Unknown driver");
      byDriver.set(key, [...(byDriver.get(key) || []), record]);
    }
    const driversHtml = Array.from(byDriver.values()).map(driverRecords => {
      const first = driverRecords[0];
      const rows = driverRecords.map(record => `<tr><td>${escapeHtml(record.vehicleType)}</td><td>${escapeHtml(record.vehicleRegistration)}</td><td>${escapeHtml(record.familiarisationDate ? new Date(record.familiarisationDate + "T12:00:00").toLocaleDateString("en-GB") : "Date not recorded")}</td><td>${escapeHtml(record.trainerName || "Not recorded")}</td><td>${escapeHtml(record.chargingSite === "alderley-park" ? "Alderley Park" : record.chargingSite === "swans" ? "Swans depot" : "Not applicable")}</td><td>${Object.keys(record.answers || {}).length}</td><td><strong class="cleared">CLEARED</strong></td></tr>`).join("");
      const categories = Array.from(new Set(driverRecords.map(record => String(record.vehicleType || "Unspecified"))));
      return `<section class="driver"><div class="driver-head"><div><h2>${escapeHtml(first.driverName || "Unknown driver")}</h2><p>Depot: ${escapeHtml(first.depotSlug || "Not recorded")}</p></div><div class="count">${driverRecords.length} completed record(s)</div></div><p class="categories"><strong>Vehicle categories cleared:</strong> ${categories.map(escapeHtml).join(", ")}</p><table><thead><tr><th>Vehicle category</th><th>Registration</th><th>Date completed</th><th>Trainer</th><th>Charging site</th><th>Statements</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table><p class="declaration">Clearance is evidenced by a completed driver familiarisation record. Each record was accepted only after all required statements were confirmed.</p></section>`;
    }).join("");
    const popup = window.open("", "_blank");
    if (!popup) return toast.error("Please allow pop-ups for this site to print the report.");
    popup.document.open();
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Swans Travel Driver Vehicle Clearance Report</title><style>
      *{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#17324b;margin:28px;font-size:11px}header{border-bottom:4px solid #12a6b2;padding-bottom:14px;margin-bottom:22px}h1{font-size:25px;margin:0 0 6px;color:#102b49}header p{margin:3px 0;color:#587086}.actions{margin:16px 0}.actions button{background:#087f8c;color:white;border:0;border-radius:6px;padding:10px 16px;font-weight:bold;cursor:pointer}.driver{page-break-inside:avoid;margin:0 0 24px;border:1px solid #cad9e5;border-radius:8px;padding:14px}.driver-head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #dce7ee;padding-bottom:8px}.driver h2{font-size:18px;margin:0 0 4px}.driver-head p,.categories,.declaration{margin:5px 0;color:#587086}.count{font-weight:bold;color:#087f8c}.categories{margin:12px 0}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #dce5eb;padding:7px;text-align:left}th{background:#eef5f8;color:#29465d}.cleared{color:#087f65}.declaration{font-size:10px;margin-top:10px}footer{margin-top:24px;border-top:1px solid #cad9e5;padding-top:8px;color:#71869a;font-size:9px}@media print{body{margin:12mm}.actions{display:none}.driver{break-inside:avoid}header{break-after:avoid}}
      </style></head><body><header><h1>Swans Travel</h1><p>Driver Vehicle Familiarisation and Clearance Report</p><p>Generated: ${escapeHtml(new Date().toLocaleString("en-GB"))}</p><p>Completed familiarisation records: ${filteredRecords.length} | Drivers: ${byDriver.size}</p></header><div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div>${driversHtml}<footer>Swans Travel | Ops Command Centre | Confidential training and compliance record</footer><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
    popup.document.close();
  };

  const parseRegs = (value: string) => Array.from(new Set(value.split(",").map(item => item.trim().toUpperCase()).filter(Boolean)));
  const standardCategories = [{ vehicleType: "Overdeck VIP", registrations: ["X17", "FUM", "V18", "X20"] }, { vehicleType: "Irizar New Generation", registrations: [] }, { vehicleType: "Irizar Old Generation", registrations: [] }, { vehicleType: "Electric Coach", registrations: [] }, { vehicleType: "Yutong", registrations: [] }, { vehicleType: "Double Deck Bus", registrations: [] }];
  const addStandardCategories = async () => { setSaving(true); try { for (const item of standardCategories) { if (!catalog.some((row: any) => String(row.vehicleType).toLowerCase() === item.vehicleType.toLowerCase())) await add("vehicleFamiliarisationVehicles", item); } toast.success("Standard vehicle categories added. Add registrations to each category as required."); } catch (error) { toast.error(error instanceof Error ? error.message : "Categories could not be added."); } finally { setSaving(false); } };

  const saveNewVehicleType = async (event: FormEvent) => {
    event.preventDefault();
    const regs = parseRegs(registrationList);
    if (!vehicleType.trim() || regs.length === 0) return toast.error("Enter a vehicle type and at least one registration.");
    if (catalog.some((item: any) => String(item.vehicleType).toLowerCase() === vehicleType.trim().toLowerCase())) return toast.error("That vehicle type already exists. Edit its registrations below.");
    setSaving(true);
    try {
      await add("vehicleFamiliarisationVehicles", { vehicleType: vehicleType.trim(), registrations: regs });
      setVehicleType("");
      setRegistrationList("");
      toast.success("Vehicle type and registrations saved.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Vehicle type could not be saved."); }
    finally { setSaving(false); }
  };
  const beginEdit = (item: any) => { setEditingId(item._docId); setEditType(item.vehicleType); setEditRegistrations((item.registrations || []).join(", ")); };
  const saveEdit = async () => {
    const regs = parseRegs(editRegistrations);
    if (!editType.trim() || regs.length === 0) return toast.error("Enter a vehicle type and at least one registration.");
    setSaving(true);
    try { await patch("vehicleFamiliarisationVehicles", editingId, { vehicleType: editType.trim(), registrations: regs }); setEditingId(""); toast.success("Vehicle options updated."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Vehicle options could not be updated."); }
    finally { setSaving(false); }
  };
  const deleteType = async (item: any) => {
    if (!window.confirm(`Remove ${item.vehicleType} from the driver dropdown?`)) return;
    try { await remove("vehicleFamiliarisationVehicles", item._docId); toast.success("Vehicle type removed."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Vehicle type could not be removed."); }
  };

  if (!profile) return <LoadError message="Sign in with an operations account to view training records." onRetry={() => void refresh()} />;
  if (!canManage) return <div className="mx-auto max-w-3xl py-12"><PageHeader eyebrow="Training" title="Access restricted" description="Vehicle familiarisation records are available to operations leads and managers." /></div>;

  return <div className="mx-auto max-w-6xl space-y-6">
    <PageHeader eyebrow="People and drivers" title="Training" description="Manage vehicle options and review driver familiarisation sign-offs." actions={<a href="/vehicle-familiarisation" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-md bg-[#0B8997] px-4 text-sm font-medium text-white hover:bg-[#08717C]">Open driver sign-off link</a>} />
    <DriverTrainingMatrix />
    <Panel>
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><PanelHeading title="Vehicle types and registrations" description="Drivers choose a vehicle type first, then one of the registrations listed under it. Categories without registrations remain unavailable to drivers until you add fleet numbers." /><Button type="button" variant="outline" onClick={() => void addStandardCategories()} disabled={saving}>Add standard categories</Button></div>
      <form onSubmit={event => void saveNewVehicleType(event)} className="grid gap-4 border-b p-5 sm:grid-cols-[1fr_2fr_auto] sm:items-end"><div className="space-y-2"><Label htmlFor="vf-new-type">Vehicle type</Label><Input id="vf-new-type" value={vehicleType} onChange={event=>setVehicleType(event.target.value)} placeholder="e.g. Overdeck VIP" required /></div><div className="space-y-2"><Label htmlFor="vf-new-regs">Registrations under this type</Label><Input id="vf-new-regs" value={registrationList} onChange={event=>setRegistrationList(event.target.value)} placeholder="Separate registrations with commas" required /><p className="text-xs text-muted-foreground">Starting example: X17, FUM, V18, X20</p></div><Button type="submit" disabled={saving}>{saving?"Saving…":"Add vehicle type"}</Button></form>
      {catalog.length===0?<p className="p-5 text-sm text-muted-foreground">Add the vehicle types and registrations drivers should be able to select.</p>:<div className="divide-y">{catalog.map((item:any)=><div key={item._docId} className="p-5">{editingId===item._docId?<div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto_auto] sm:items-end"><div className="space-y-2"><Label>Vehicle type</Label><Input value={editType} onChange={event=>setEditType(event.target.value)} /></div><div className="space-y-2"><Label>Registrations</Label><Input value={editRegistrations} onChange={event=>setEditRegistrations(event.target.value)} /></div><Button onClick={()=>void saveEdit()} disabled={saving}>Save</Button><Button variant="outline" onClick={()=>setEditingId("")}>Cancel</Button></div>:<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold">{item.vehicleType}</h3><p className="mt-1 text-sm text-muted-foreground">{(item.registrations||[]).join(" · ")}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>beginEdit(item)}>Edit</Button><Button size="sm" variant="outline" onClick={()=>void deleteType(item)}>Remove</Button></div></div>}</div>)}</div>}
    </Panel>
    <Panel>
      <div className="flex flex-col gap-3 border-b p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><PanelHeading title="Vehicle familiarisation records" description={`${filteredRecords.length} of ${records.length} driver sign-off${records.length===1?"":"s"} shown`} /><Button type="button" variant="outline" onClick={printClearanceReport} disabled={!filteredRecords.length}><Printer className="mr-2 h-4 w-4" />Print filtered report / PDF</Button></div><div className="grid gap-3 sm:grid-cols-3"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search driver, type or registration" className="pl-9" /></div><select aria-label="Filter by vehicle category" value={reportCategory} onChange={event=>setReportCategory(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="all">All vehicle categories</option>{Array.from(new Set(records.map((row:any)=>String(row.vehicleType||"")).filter(Boolean))).sort().map(category=><option key={category} value={category}>{category}</option>)}</select><select aria-label="Filter by vehicle registration" value={reportRegistration} onChange={event=>setReportRegistration(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm"><option value="all">All registrations</option>{Array.from(new Set(records.map((row:any)=>String(row.vehicleRegistration||"").toUpperCase()).filter(Boolean))).sort().map(registration=><option key={registration} value={registration}>{registration}</option>)}</select></div></div>
      {filteredRecords.length===0?<div className="p-8 text-center text-sm text-muted-foreground">{records.length?"No records match that search.":"No vehicle familiarisation sign-offs yet."}</div>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Driver</th><th className="px-5 py-3 font-medium">Vehicle type</th><th className="px-5 py-3 font-medium">Registration</th><th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3 font-medium">Trainer</th><th className="px-5 py-3 font-medium">Charging site</th><th className="px-5 py-3 font-medium">Statements confirmed</th></tr></thead><tbody className="divide-y">{filteredRecords.map((row:any)=><tr key={row._docId}><td className="px-5 py-3 font-medium">{row.driverName}</td><td className="px-5 py-3">{row.vehicleType}</td><td className="px-5 py-3">{row.vehicleRegistration}</td><td className="px-5 py-3">{row.familiarisationDate?new Date(row.familiarisationDate+"T12:00:00").toLocaleDateString("en-GB"):"—"}</td><td className="px-5 py-3">{row.trainerName || "Not recorded"}</td><td className="px-5 py-3">{row.chargingSite === "alderley-park" ? "Alderley Park" : row.chargingSite === "swans" ? "Swans depot" : "—"}</td><td className="px-5 py-3">{Object.keys(row.answers || {}).length} statements</td></tr>)}</tbody></table></div>}
    </Panel>
  </div>;
}
