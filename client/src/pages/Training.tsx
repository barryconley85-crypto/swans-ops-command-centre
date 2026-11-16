import { useMemo, useState, type FormEvent } from "react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadError, PageHeader, Panel, PanelHeading } from "@/components/WorkspacePrimitives";
import { localDateKey } from "@/lib/operations";
import { Search, GraduationCap } from "lucide-react";
import { toast } from "sonner";

export default function Training() {
  const { profile, state, add, refresh } = useWorkspace();
  const canManage = ["lead", "manager"].includes(profile?.memberRole || "");
  const drivers = useMemo(() => (state.drivers || []).filter((driver: any) => driver.active !== false).sort((a: any, b: any) => String(a.name).localeCompare(String(b.name))), [state.drivers]);
  const records = useMemo(() => [...(state.vehicleFamiliarisations || [])].sort((a: any, b: any) => String(b.familiarisationDate || "").localeCompare(String(a.familiarisationDate || ""))), [state.vehicleFamiliarisations]);
  const [driverId, setDriverId] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [trainer, setTrainer] = useState("");
  const [familiarisationDate, setFamiliarisationDate] = useState(localDateKey());
  const [notes, setNotes] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const filteredRecords = records.filter((row: any) => !search || [row.driverName, row.vehicle, row.trainer].some(value => String(value || "").toLowerCase().includes(search.toLowerCase())));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const driver = drivers.find((item: any) => item._docId === driverId);
    if (!driver) return toast.error("Choose a driver.");
    if (!vehicle.trim()) return toast.error("Enter the vehicle registration or fleet number.");
    if (!trainer.trim()) return toast.error("Enter who delivered the familiarisation.");
    setSaving(true);
    try {
      await add("vehicleFamiliarisations", {
        driverId: driver._docId,
        driverName: driver.name,
        vehicle: vehicle.trim().toUpperCase(),
        familiarisationDate,
        trainer: trainer.trim(),
        notes: notes.trim(),
        createdByUserId: profile?.userId,
        createdByName: profile?.displayName,
      });
      setVehicle("");
      setTrainer("");
      setNotes("");
      setFamiliarisationDate(localDateKey());
      toast.success("Vehicle familiarisation recorded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The familiarisation record could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  if (!profile) return <LoadError message="Sign in with an operations account to view training records." onRetry={() => void refresh()} />;
  if (!canManage) return <div className="mx-auto max-w-3xl py-12"><PageHeader eyebrow="Training" title="Access restricted" description="Vehicle familiarisation records are available to operations leads and managers." /></div>;

  return <div className="mx-auto max-w-6xl space-y-6">
    <PageHeader eyebrow="People and drivers" title="Training" description="Record and review driver vehicle familiarisation." />
    <Panel>
      <PanelHeading title="Vehicle familiarisation" description="Record when a driver has been shown a specific vehicle and who delivered it." />
      <form onSubmit={event => void submit(event)} className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-2 lg:col-span-2"><Label htmlFor="vf-driver">Driver</Label><select id="vf-driver" required value={driverId} onChange={event => setDriverId(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select a driver</option>{drivers.map((driver: any) => <option key={driver._docId} value={driver._docId}>{driver.name}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="vf-vehicle">Vehicle registration / fleet no.</Label><Input id="vf-vehicle" value={vehicle} onChange={event => setVehicle(event.target.value)} placeholder="e.g. AB12 CDE" required /></div>
        <div className="space-y-2"><Label htmlFor="vf-date">Date</Label><Input id="vf-date" type="date" value={familiarisationDate} onChange={event => setFamiliarisationDate(event.target.value)} required /></div>
        <div className="space-y-2"><Label htmlFor="vf-trainer">Delivered by</Label><Input id="vf-trainer" value={trainer} onChange={event => setTrainer(event.target.value)} placeholder="Trainer or supervisor" required /></div>
        <div className="space-y-2 sm:col-span-2 lg:col-span-4"><Label htmlFor="vf-notes">Notes (optional)</Label><Input id="vf-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Vehicle controls, accessibility equipment, or other details covered" /></div>
        <div className="flex items-end"><Button type="submit" disabled={saving || drivers.length === 0}>{saving ? "Saving…" : "Record familiarisation"}</Button></div>
      </form>
    </Panel>
    <Panel>
      <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><PanelHeading title="Familiarisation records" description={`${records.length} record${records.length === 1 ? "" : "s"}`} /><div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search driver, vehicle, trainer" className="pl-9" /></div></div>
      {filteredRecords.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">{records.length ? "No records match that search." : "No vehicle familiarisation records yet."}</div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Driver</th><th className="px-5 py-3 font-medium">Vehicle</th><th className="px-5 py-3 font-medium">Date</th><th className="px-5 py-3 font-medium">Delivered by</th><th className="px-5 py-3 font-medium">Notes</th></tr></thead><tbody className="divide-y">{filteredRecords.map((row: any) => <tr key={row._docId}><td className="px-5 py-3 font-medium">{row.driverName}</td><td className="px-5 py-3">{row.vehicle}</td><td className="px-5 py-3">{row.familiarisationDate ? new Date(row.familiarisationDate + "T12:00:00").toLocaleDateString("en-GB") : "—"}</td><td className="px-5 py-3">{row.trainer}</td><td className="px-5 py-3 text-muted-foreground">{row.notes || "—"}</td></tr>)}</tbody></table></div>}
    </Panel>
  </div>;
}
