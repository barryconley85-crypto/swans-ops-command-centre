import { useMemo, useState, type FormEvent } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadError, PageHeader, Panel, PanelHeading } from "@/components/WorkspacePrimitives";
import { Search } from "lucide-react";
import { toast } from "sonner";

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
  const [saving, setSaving] = useState(false);
  const filteredRecords = records.filter((row: any) => !search || [row.driverName, row.vehicleType, row.vehicleRegistration].some(value => String(value || "").toLowerCase().includes(search.toLowerCase())));
  const parseRegs = (value: string) => Array.from(new Set(value.split(",").map(item => item.trim().toUpperCase()).filter(Boolean)));

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
    <PageHeader eyebrow="People and drivers" title="Training" description="Manage vehicle options and review driver familiarisation sign-offs." actions={<a href="/vehicle-familiarisation" target="_blank" rel="noreferrer" className="inline-flex h-10 items-center rounded-md bg-[#1D5C63] px-4 text-sm font-medium text-white hover:bg-[#164B50]">Open driver sign-off link</a>} />
    <Panel>
      <PanelHeading title="Vehicle types and registrations" description="Drivers choose a vehicle type first, then one of the registrations listed under it." />
      <form onSubmit={event => void saveNewVehicleType(event)} className="grid gap-4 border-b p-5 sm:grid-cols-[1fr_2fr_auto] sm:items-end"><div className="space-y-2"><Label htmlFor="vf-new-type">Vehicle type</Label><Input id="vf-new-type" value={vehicleType} onChange={event=>setVehicleType(event.target.value)} placeholder="e.g. Overdeck VIP" required /></div><div className="space-y-2"><Label htmlFor="vf-new-regs">Registrations under this type</Label><Input id="vf-new-regs" value={registrationList} onChange={event=>setRegistrationList(event.target.value)} placeholder="Separate registrations with commas" required /><p className="text-xs text-muted-foreground">Starting example: X17, FUM, V18, X20</p></div><Button type="submit" disabled={saving}>{saving?"Saving…":"Add vehicle type"}</Button></form>
      {catalog.length===0?<p className="p-5 text-sm text-muted-foreground">Add the vehicle types and registrations drivers should be able to select.</p>:<div className="divide-y">{catalog.map((item:any)=><div key={item._docId} className="p-5">{editingId===item._docId?<div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto_auto] sm:items-end"><div className="space-y-2"><Label>Vehicle type</Label><Input value={editType} onChange={event=>setEditType(event.target.value)} /></div><div className="space-y-2"><Label>Registrations</Label><Input value={editRegistrations} onChange={event=>setEditRegistrations(event.target.value)} /></div><Button onClick={()=>void saveEdit()} disabled={saving}>Save</Button><Button variant="outline" onClick={()=>setEditingId("")}>Cancel</Button></div>:<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="font-semibold">{item.vehicleType}</h3><p className="mt-1 text-sm text-muted-foreground">{(item.registrations||[]).join(" · ")}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>beginEdit(item)}>Edit</Button><Button size="sm" variant="outline" onClick={()=>void deleteType(item)}>Remove</Button></div></div>}</div>)}</div>}
    </Panel>
    <Panel>
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><PanelHeading title="Vehicle familiarisation records" description={`${records.length} driver sign-off${records.length===1?"":"s"}`} /><div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search driver, type or registration" className="pl-9" /></div></div>
      {filteredRecords.length===0?<div className="p-8 text-center text-sm text-muted-foreground">{records.length?"No records match that search.":"No vehicle familiarisation sign-offs yet."}</div>:<div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Driver</th><th className="px-5 py-3 font-medium">Vehicle type</th><th className="px-5 py-3 font-medium">Registration</th><th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3 font-medium">Sections confirmed</th></tr></thead><tbody className="divide-y">{filteredRecords.map((row:any)=><tr key={row._docId}><td className="px-5 py-3 font-medium">{row.driverName}</td><td className="px-5 py-3">{row.vehicleType}</td><td className="px-5 py-3">{row.vehicleRegistration}</td><td className="px-5 py-3">{row.familiarisationDate?new Date(row.familiarisationDate+"T12:00:00").toLocaleDateString("en-GB"):"—"}</td><td className="px-5 py-3">{row.sectionIds?.length||0} / 8</td></tr>)}</tbody></table></div>}
    </Panel>
  </div>;
}
