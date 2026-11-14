import { useWorkspace } from "@/contexts/WorkspaceContext";
import { firebaseDb } from "@/lib/firebase";
import { addDoc, collection, deleteDoc, doc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";
import { QrCode, Download, Upload, Plus, Trash2, CheckCircle2, Clock3, MapPin } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader, LoadError } from "@/components/WorkspacePrimitives";
import { localDateKey } from "@/lib/operations";

const depots = [{ slug: "travelmaster", name: "Travelmaster" }, { slug: "alderly-park", name: "Alderly Park" }, { slug: "swans", name: "Swans" }, { slug: "cheltenham", name: "Cheltenham" }];
const depotName = (slug: string) => depots.find(depot => depot.slug === slug)?.name || slug;
const csvEscape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export default function DriverSignOn() {
  const { profile, state, refresh } = useWorkspace();
  const [name, setName] = useState("");
  const [driverDepot, setDriverDepot] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showQr, setShowQr] = useState<string | null>(null);
  const [geofences, setGeofences] = useState<Record<string, any>>({});
  const [geofenceRadius, setGeofenceRadius] = useState(100);
  const [geoBusy, setGeoBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canManage = ["lead", "manager"].includes(profile?.memberRole || "");
  const today = localDateKey();
  const todaysSignOns = useMemo(() => (state.signOns || []).filter((item: any) => item.workDate === today).sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0)), [state.signOns, today]);
  const activeDrivers = (state.drivers || []).filter((driver: any) => driver.active !== false).sort((a: any, b: any) => a.name.localeCompare(b.name));
  const inactiveDrivers = (state.drivers || []).filter((driver: any) => driver.active === false).sort((a: any, b: any) => a.name.localeCompare(b.name));

  useEffect(() => {
    if (!firebaseDb || !canManage) return;
    getDocs(collection(firebaseDb, "ops_depot_geofences"))
      .then(snapshot => setGeofences(Object.fromEntries(snapshot.docs.map(item => [item.id, item.data()]))))
      .catch(() => toast.error("Depot GPS settings could not be loaded."));
  }, [canManage]);

  const setDepotGeofence = (slug: string) => {
    if (!firebaseDb) return;
    if (!navigator.geolocation) return toast.error("This device does not support GPS location.");
    if (!Number.isFinite(geofenceRadius) || geofenceRadius < 30 || geofenceRadius > 500) return toast.error("Choose a radius between 30 and 500 metres.");
    setGeoBusy(slug);
    navigator.geolocation.getCurrentPosition(async position => {
      if (position.coords.accuracy > 50) {
        setGeoBusy(null);
        toast.error("GPS accuracy must be 50 metres or better. Move outside and try again.");
        return;
      }
      const config = { depotSlug: slug, depotName: depotName(slug), centerLat: position.coords.latitude, centerLng: position.coords.longitude, radiusMetres: geofenceRadius, enabled: true, updatedAt: Date.now(), updatedBy: profile?.displayName || "Operations" };
      try {
        await setDoc(doc(firebaseDb, "ops_depot_geofences", slug), config);
        setGeofences(current => ({ ...current, [slug]: config }));
        toast.success(depotName(slug) + " GPS geofence saved.");
      } catch (reason) {
        toast.error(reason instanceof Error ? reason.message : "Depot GPS location could not be saved.");
      } finally { setGeoBusy(null); }
    }, reason => {
      setGeoBusy(null);
      toast.error(reason.code === 1 ? "Allow location access in your phone settings, then try again." : reason.code === 2 ? "Your phone could not determine its GPS location. Try outside." : "GPS timed out. Please try again.");
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  };

  if (!profile) return <LoadError message="You need an operations account to manage driver sign-on." onRetry={() => void refresh()} />;
  if (!canManage) return <div className="mx-auto max-w-3xl py-12"><PageHeader eyebrow="Driver sign-on" title="Access restricted" description="Only the operations lead and managers can manage the driver directory and depot sign-on records." /></div>;

  const saveDriver = async () => {
    const trimmed = name.trim();
    if (!trimmed || !firebaseDb) return toast.error("Enter a driver name.");
    if (!driverDepot) return toast.error("Choose the driver's depot.");
    try {
      if (editing) await updateDoc(doc(firebaseDb, "ops_drivers", editing), { name: trimmed, depot: driverDepot, updatedAt: Date.now() });
      else await addDoc(collection(firebaseDb, "ops_drivers"), { name: trimmed, depot: driverDepot, active: true, createdAt: Date.now(), updatedAt: Date.now() });
      setName(""); setDriverDepot(""); setEditing(null); setShowForm(false); await refresh(); toast.success(editing ? "Driver updated." : "Driver added.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Driver could not be saved."); }
  };
  const removeDriver = async (driver: any) => {
    if (!firebaseDb || !window.confirm(`Remove ${driver.name} from the active driver list? Existing sign-on history will remain.`)) return;
    try { await updateDoc(doc(firebaseDb, "ops_drivers", driver._docId), { active: false, updatedAt: Date.now() }); await refresh(); toast.success("Driver removed from the active list."); } catch (error) { toast.error(error instanceof Error ? error.message : "Driver could not be removed."); }
  };
  const reactivateDriver = async (driver: any) => {
    if (!firebaseDb || !window.confirm(`Reactivate ${driver.name} and return them to the active driver lists?`)) return;
    try {
      await updateDoc(doc(firebaseDb, "ops_drivers", driver._docId), { active: true, employmentStatus: "active", reactivatedAt: Date.now(), reactivatedBy: profile?.displayName || "Operations", updatedAt: Date.now() });
      await refresh();
      toast.success(`${driver.name} returned to the active driver list.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Driver could not be reactivated."); }
  };
  const importCsv = async (file: File) => {
    if (!firebaseDb) return;
    const lines = (await file.text()).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const rows = lines.slice(/^name\s*(,|$)/i.test(lines[0] || "") ? 1 : 0).map(line => { const columns = line.split(",").map(value => value.replace(/^"|"$/g, "").trim()); const depotValue = columns[1]?.toLowerCase(); const depot = depotValue === "alderly park" ? "alderly-park" : depotValue === "travelmaster" ? "travelmaster" : depotValue === "swans" ? "swans" : depotValue === "cheltenham" ? "cheltenham" : depotValue === "unassigned" || !depotValue ? "" : columns[1] || ""; return { name: columns[0], depot }; }).filter(row => row.name);
    if (!rows.length || rows.some(row => row.depot && !depots.some(depot => depot.slug === row.depot))) return toast.error("CSV must include name and depot columns using Travelmaster, Alderly Park, Swans, Cheltenham, or Unassigned.");
    try { for (const row of rows) { const existing = activeDrivers.find((driver: any) => driver.name.trim().toLowerCase() === row.name.trim().toLowerCase()); if (existing) await updateDoc(doc(firebaseDb, "ops_drivers", existing._docId), { name: row.name, depot: row.depot, active: true, updatedAt: Date.now() }); else await addDoc(collection(firebaseDb, "ops_drivers"), { name: row.name, depot: row.depot, active: true, createdAt: Date.now(), updatedAt: Date.now() }); } await refresh(); toast.success(`${rows.length} driver${rows.length === 1 ? "" : "s"} imported or updated.`); } catch (error) { toast.error(error instanceof Error ? error.message : "CSV import failed."); }
  };
  const exportCsv = () => {
    const rows = ["name,depot,active", ...activeDrivers.map((driver: any) => `${csvEscape(driver.name)},${csvEscape(driver.depot ? depotName(driver.depot) : "Unassigned")},${driver.active !== false}`)];
    const url = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "swans-drivers.csv"; link.click(); URL.revokeObjectURL(url);
  };
  const signOnCount = (slug: string) => todaysSignOns.filter((item: any) => item.depotSlug === slug).length;

  return <div className="mx-auto max-w-[1450px] pb-10"><header className="relative overflow-hidden rounded-2xl bg-[#102F46] px-5 py-6 text-white shadow-[0_18px_38px_-22px_rgba(16,47,70,0.72)] sm:px-7 sm:py-7"><div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border-[28px] border-[#35C9C3]/10" /><div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9DE8E5]">Driver sign-on</p><h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-white sm:text-3xl">Driver sign-on</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#C8DCE7]">Manage depot driver lists and view today's sign-ons.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" className="h-10 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Import CSV</Button><input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void importCsv(file); event.currentTarget.value = ""; }} /><Button variant="outline" className="h-10 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button></div></div></header>
    <section className="mt-6 rounded-2xl border border-[#DCE7EF] bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#2B8E91]">Location security</p><h2 className="mt-1 text-base font-semibold text-[#17384F]">Depot GPS geofence setup</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-[#71879A]">Stand at each depot and save its GPS position. Drivers will only be able to sign on from within the saved radius.</p></div>
        <div className="w-full sm:w-44"><Label htmlFor="geofence-radius">Radius (metres)</Label><Input id="geofence-radius" type="number" min={30} max={500} value={geofenceRadius} onChange={event => setGeofenceRadius(Number(event.target.value))} className="mt-1" /></div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {depots.map(depot => { const config = geofences[depot.slug]; return <div key={depot.slug} className="rounded-xl border border-[#E3EBF0] bg-[#F8FAFC] p-3">
          <div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-[#29485E]">{depot.name}</p><Badge className={config?.enabled ? "bg-[#E4F4F3] text-[#277F82]" : "bg-[#FFF2E5] text-[#9A5B19]"}>{config?.enabled ? "Configured" : "Not set"}</Badge></div>
          {config?.enabled ? <p className="mt-2 text-[11px] text-[#71879A]">{config.radiusMetres}m radius</p> : <p className="mt-2 text-[11px] text-[#71879A]">No authorised location saved</p>}
          <Button size="sm" variant="outline" className="mt-3 w-full" disabled={geoBusy === depot.slug} onClick={() => setDepotGeofence(depot.slug)}>{geoBusy === depot.slug ? "Getting GPS…" : config?.enabled ? "Update location" : "Set depot location"}</Button>
        </div>; })}
      </div>
      <p className="mt-3 text-[10px] leading-4 text-[#8294A2]">Configure each depot while physically on site. Setup GPS must be accurate to 50 metres or better. Radius can be set between 30 and 500 metres.</p>
    </section>
    <section className="mt-6 grid gap-4 md:grid-cols-2"><div className="rounded-2xl border border-[#DCE7EF] bg-white p-5 shadow-[0_14px_30px_-26px_rgba(16,47,70,0.45)]"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#71889A]">Today</p><p className="mt-2 text-3xl font-semibold text-[#102F46]">{todaysSignOns.length}</p><p className="mt-1 text-xs text-[#72879A]">driver sign-on records</p></div><CheckCircle2 className="h-6 w-6 text-[#2C9D98]" /></div></div><div className="rounded-2xl border border-[#DCE7EF] bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#71889A]">Active driver list</p><p className="mt-2 text-3xl font-semibold text-[#102F46]">{activeDrivers.length}</p><p className="mt-1 text-xs text-[#72879A]">assigned across both depots</p></div><MapPin className="h-6 w-6 text-[#2B8E91]" /></div></div></section>
    <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]"><div className="rounded-2xl border border-[#DCE7EF] bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-[#17384F]">Driver directory</h2><p className="mt-1 text-xs text-[#71879A]">Assign drivers to a depot for shorter QR sign-on lists. Attendance still uses the complete driver list.</p></div><Button size="sm" onClick={() => { setEditing(null); setName(""); setDriverDepot(""); setShowForm(true); }}><Plus className="mr-1.5 h-3.5 w-3.5" />New driver</Button></div>{showForm ? <div className="mt-4 rounded-xl border border-[#D7E7EF] bg-[#F4F8FB] p-3"><Label htmlFor="new-driver-name">Driver name</Label><div className="mt-1.5 grid gap-2 md:grid-cols-[1fr_190px_auto_auto]"><Input id="new-driver-name" autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="Driver name" onKeyDown={event => { if (event.key === "Enter") void saveDriver(); }} /><select value={driverDepot} onChange={event => setDriverDepot(event.target.value)} className="h-10 rounded-md border border-[#C9D9E5] bg-white px-3 text-sm"><option value="">Choose depot…</option>{depots.map(depot => <option key={depot.slug} value={depot.slug}>{depot.name}</option>)}</select><Button onClick={() => void saveDriver()}>{editing ? "Save" : "Add"}</Button><Button variant="ghost" onClick={() => { setShowForm(false); setEditing(null); setName(""); setDriverDepot(""); }}>Cancel</Button></div></div> : null}<div className="mt-4 divide-y divide-[#E8EFF4]">{activeDrivers.map((driver: any) => <div key={driver._docId} className="flex items-center justify-between gap-3 py-3"><div><span className="text-sm font-medium text-[#29485E]">{driver.name}</span><p className="text-xs text-[#71879A]">{driver.depot ? depotName(driver.depot) : "Depot not assigned"}</p></div><div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => { setEditing(driver._docId); setName(driver.name); setDriverDepot(driver.depot || ""); setShowForm(true); }}>Edit</Button><Button size="icon" variant="ghost" onClick={() => void removeDriver(driver)} aria-label={`Remove ${driver.name}`}><Trash2 className="h-4 w-4 text-[#A84237]" /></Button></div></div>)}{!activeDrivers.length ? <p className="py-8 text-center text-xs text-[#8294A2]">Add drivers manually or import a CSV.</p> : null}</div>{inactiveDrivers.length ? <div className="mt-5 border-t border-[#E8EFF4] pt-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-[#526C80]">Inactive drivers</h3><Badge variant="outline">{inactiveDrivers.length}</Badge></div><p className="mt-1 text-xs text-[#8294A2]">Former drivers are kept here for historical records and can be reactivated.</p><div className="mt-2 divide-y divide-[#E8EFF4]">{inactiveDrivers.map((driver: any) => <div key={driver._docId} className="flex items-center justify-between gap-3 py-3"><div><span className="text-sm font-medium text-[#71879A]">{driver.name}</span><p className="text-xs text-[#8294A2]">{driver.depot ? depotName(driver.depot) : "Depot not assigned"} · Inactive</p></div><Button size="sm" variant="outline" onClick={() => void reactivateDriver(driver)}>Reactivate</Button></div>)}</div></div> : null}</div><div className="space-y-6"><div className="grid gap-4 md:grid-cols-2">{depots.map(depot => { const url = `${window.location.origin}/driver-sign-on/${depot.slug}`; return <div key={depot.slug} className="rounded-2xl border border-[#DCE7EF] bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><h2 className="text-base font-semibold text-[#17384F]">{depot.name}</h2><p className="mt-1 text-xs text-[#71879A]">{signOnCount(depot.slug)} signed on today</p></div><QrCode className="h-5 w-5 text-[#2B8E91]" /></div><div className="mt-4 flex justify-center rounded-xl bg-white p-3"><QRCodeSVG value={url} size={150} includeMargin /></div><p className="mt-3 break-all text-[10px] text-[#8294A2]">{url}</p><Button variant="outline" className="mt-3 w-full" onClick={() => setShowQr(depot.slug)}><QrCode className="mr-2 h-4 w-4" />Open driver page</Button></div>; })}</div><div className="rounded-2xl border border-[#DCE7EF] bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-base font-semibold text-[#17384F]">Today’s sign-ons</h2><p className="mt-1 text-xs text-[#71879A]">Live records from either depot.</p></div><Clock3 className="h-5 w-5 text-[#78918A]" /></div><div className="mt-3 divide-y divide-[#E8EFF4]">{todaysSignOns.map((item: any) => <div key={item._docId} className="flex items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold text-[#29485E]">{item.driverName}</p><p className="text-xs text-[#71879A]">{depotName(item.depotSlug)}</p></div><Badge className="bg-[#E4F4F3] text-[#277F82]">{new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</Badge></div>)}{!todaysSignOns.length ? <p className="py-8 text-center text-xs text-[#8294A2]">No drivers have signed on today.</p> : null}</div></div></div></section>{showQr ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-5" onClick={() => setShowQr(null)}><div className="rounded-2xl bg-white p-7 text-center shadow-xl" onClick={event => event.stopPropagation()}><h2 className="text-xl font-semibold text-[#24342D]">{depotName(showQr)} driver sign-on</h2><div className="mt-5"><QRCodeSVG value={`${window.location.origin}/driver-sign-on/${showQr}`} size={260} includeMargin /></div><p className="mt-4 text-xs text-[#72879A]">Scan this code with a normal phone camera.</p><Button className="mt-4" onClick={() => setShowQr(null)}>Close</Button></div></div> : null}</div>;
}

export function PublicDriverSignOn({ depot }: { depot: string }) {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [selected, setSelected] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const depotTitle = depotName(depot);
  useEffect(() => { if (!firebaseDb) return; getDocs(query(collection(firebaseDb, "ops_drivers"), where("active", "==", true))).then(snapshot => setDrivers(snapshot.docs.map(item => ({ _docId: item.id, ...item.data() })).filter((driver: any) => driver.depot === depot).sort((a: any, b: any) => a.name.localeCompare(b.name)))).catch(() => setError("The driver list could not be loaded.")); }, [depot]);
  const signOn = async () => {
    const driver = drivers.find(item => item._docId === selected);
    if (!driver) return setError("Select your name to sign on.");
    if (!navigator.geolocation) return setError("This phone does not support GPS location. Please tell the depot team.");
    setError("");
    navigator.geolocation.getCurrentPosition(async position => {
      try {
        const response = await fetch("/api/driver-sign-on", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverId: driver._docId, depotSlug: depot, latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, positionTimestamp: position.timestamp })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Sign-on could not be verified. Please tell the depot team.");
        setDone(true);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Sign-on could not be recorded. Please try again.");
      }
    }, reason => {
      setError(reason.code === 1 ? "Location permission is required. Allow location access in your phone settings and try again." : reason.code === 2 ? "Your phone could not determine its GPS location. Move outside and try again." : "GPS timed out. Please try again.");
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  };
  if (done) return <main className="flex min-h-screen items-center justify-center bg-[#F3F7FA] p-5"><div className="w-full max-w-md rounded-3xl border border-[#D8E7F0] bg-white p-8 text-center shadow-xl"><CheckCircle2 className="mx-auto h-14 w-14 text-[#3D8062]" /><h1 className="mt-5 text-2xl font-semibold text-[#102F46]">You are signed on</h1><p className="mt-2 text-sm text-[#5E7486]">{depotTitle} · {new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p><p className="mt-5 text-xs text-[#8294A2]">You can close this page. The operations team can now see your sign-on.</p></div></main>;
  return <main className="flex min-h-screen items-center justify-center bg-[#F3F7FA] p-5"><div className="w-full max-w-md rounded-3xl border border-[#D8E7F0] bg-white p-7 shadow-xl"><div className="flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E3F2F3] text-[#277F82]"><MapPin className="h-5 w-5" /></div><div><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#70879A]">Swans Travel</p><h1 className="text-2xl font-semibold text-[#102F46]">Driver sign-on</h1></div></div><div className="mt-6 rounded-2xl bg-[#EEF5F9] p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#70879A]">Depot</p><p className="mt-1 text-xl font-semibold text-[#173F56]">{depotTitle}</p></div><div className="mt-6 space-y-2"><Label htmlFor="driver">Select your name</Label><select id="driver" value={selected} onChange={event => setSelected(event.target.value)} className="h-12 w-full rounded-xl border border-[#C9D9E5] bg-white px-3 text-base"><option value="">Choose your name…</option>{drivers.map(driver => <option key={driver._docId} value={driver._docId}>{driver.name}</option>)}</select></div>{error ? <p className="mt-4 rounded-xl bg-[#FFF0EE] p-3 text-xs text-[#A84237]">{error}</p> : null}<Button className="mt-6 h-12 w-full bg-[#167E8A] text-base hover:bg-[#126674]" onClick={() => void signOn()} disabled={!drivers.length}>Sign on now</Button><p className="mt-4 text-center text-[11px] leading-5 text-[#8294A2]">Your live GPS location is checked against this depot before sign-on is accepted. Please only select your own name.</p></div></main>;
}

export { depots };
