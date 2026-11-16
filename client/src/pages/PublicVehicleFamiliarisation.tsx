import { useEffect, useState, type FormEvent } from "react";
import { collection, getDocs } from "firebase/firestore";
import { firebaseDb } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { toast } from "sonner";

const checklist = [
  ["driving-position", "Driving position, controls and dashboard"],
  ["mirrors-visibility", "Mirrors, visibility and camera systems"],
  ["doors-access", "Doors, steps and passenger access"],
  ["passenger-safety", "Passenger seating, seatbelts and handrails"],
  ["emergency-equipment", "Emergency exits and safety equipment"],
  ["accessibility-equipment", "Wheelchair lift or ramp and restraints, where fitted"],
  ["vehicle-equipment", "Tachograph and vehicle-specific equipment"],
  ["defect-procedure", "Defect reporting and breakdown procedure"],
] as const;

export default function PublicVehicleFamiliarisation() {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const [driverId, setDriverId] = useState("");
  const [pin, setPin] = useState("");
  const [vehicleTypeId, setVehicleTypeId] = useState("");
  const [vehicleRegistration, setVehicleRegistration] = useState("");
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);
  const selectedVehicleType = vehicleTypes.find(item => item.id === vehicleTypeId);
  const [checked, setChecked] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (!firebaseDb) { setLoadingDrivers(false); return; }
    Promise.all([
      fetch("/api/driver-sign-on", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list-familiarisation-drivers" }) }),
      getDocs(collection(firebaseDb, "ops_vehicle_familiarisation_vehicles"))
    ])
      .then(async ([driverResponse, typeSnapshot]) => {
        const driverResult = await driverResponse.json();
        if (!driverResponse.ok) throw new Error(driverResult.error || "The driver list could not be loaded.");
        setDrivers(driverResult.drivers || []);
        setVehicleTypes(typeSnapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a: any,b: any) => String(a.vehicleType).localeCompare(String(b.vehicleType))));
      })
      .catch(() => toast.error("The driver or vehicle list could not be loaded. Please try again."))
      .finally(() => setLoadingDrivers(false));
  }, []);

  const toggleSection = (id: string) => setChecked(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (checked.length !== checklist.length) return toast.error("Please confirm every vehicle section before submitting.");
    setBusy(true);
    try {
      const response = await fetch("/api/driver-sign-on", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit-familiarisation", driverId, pin, vehicleTypeId, vehicleRegistration, sectionIds: checked, notes }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The familiarisation could not be saved.");
      setComplete(true);
      setPin("");
      toast.success("Vehicle familiarisation saved to your driver record.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The familiarisation could not be saved.");
    } finally { setBusy(false); }
  };

  if (complete) return <main className="min-h-screen bg-[#F7F6F3] px-4 py-10 text-[#1C2924]"><section className="mx-auto max-w-2xl rounded-2xl border border-[#E0E7E2] bg-white p-7 shadow-sm sm:p-10"><CheckCircle2 className="h-10 w-10 text-emerald-700" /><p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-teal-800">Swans Travel · Driver training</p><h1 className="mt-2 text-3xl font-semibold">Familiarisation recorded</h1><p className="mt-3 text-sm leading-6 text-stone-600">Your vehicle familiarisation has been saved to the Ops Command Centre driver record.</p><Button className="mt-6 bg-[#1D5C63] hover:bg-[#164B50]" onClick={() => { setComplete(false); setDriverId(""); setVehicleTypeId(""); setVehicleRegistration(""); setChecked([]); setNotes(""); }}>Record another vehicle</Button></section></main>;

  return <main className="min-h-screen bg-[#F7F6F3] px-4 py-8 text-[#1C2924] sm:px-6"><div className="mx-auto max-w-3xl"><header className="mb-7"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-800">Swans Travel · Driver training</p><h1 className="mt-2 text-3xl font-semibold">Vehicle familiarisation</h1><p className="mt-2 text-sm leading-6 text-stone-600">Choose the vehicle you have been shown, confirm each section you understand, then verify your identity with your driver sign-on PIN.</p></header><form onSubmit={event => void submit(event)} className="space-y-6">
    <section className="space-y-4 rounded-2xl border border-[#E0E7E2] bg-white p-5 shadow-sm sm:p-7"><h2 className="text-lg font-semibold">Driver and vehicle</h2><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="vf-driver">Your name</Label><select id="vf-driver" value={driverId} onChange={event=>setDriverId(event.target.value)} required disabled={loadingDrivers} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">{loadingDrivers?"Loading drivers…":"Select your name"}</option>{drivers.map(driver=><option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></div><div className="space-y-2"><Label htmlFor="vf-type">Vehicle type</Label><select id="vf-type" value={vehicleTypeId} onChange={event=>{setVehicleTypeId(event.target.value);setVehicleRegistration("");}} required className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Select vehicle type</option>{vehicleTypes.map(type=><option key={type.id} value={type.id}>{type.vehicleType}</option>)}</select></div><div className="space-y-2 sm:col-span-2"><Label htmlFor="vf-registration">Vehicle registration or fleet number</Label><select id="vf-registration" value={vehicleRegistration} onChange={event=>setVehicleRegistration(event.target.value)} required disabled={!selectedVehicleType?.registrations?.length} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">{selectedVehicleType?.registrations?.length?"Select registration":"Select a vehicle type first"}</option>{(selectedVehicleType?.registrations||[]).map((reg:string)=><option key={reg} value={reg}>{reg}</option>)}</select></div></div></section>
    <section className="space-y-3 rounded-2xl border border-[#E0E7E2] bg-white p-5 shadow-sm sm:p-7"><div><h2 className="text-lg font-semibold">Vehicle sections</h2><p className="mt-1 text-sm text-stone-600">Tick each section once it has been explained and you are happy you understand it.</p></div>{checklist.map(([id,label])=><label key={id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 p-3.5 hover:bg-stone-50"><input type="checkbox" checked={checked.includes(id)} onChange={()=>toggleSection(id)} className="mt-1 h-4 w-4 accent-[#1D5C63]" /><span className="text-sm leading-5">{label}</span></label>)}<div className="space-y-2 pt-1"><Label htmlFor="vf-notes">Notes (optional)</Label><Input id="vf-notes" value={notes} onChange={event=>setNotes(event.target.value)} maxLength={500} placeholder="Add any follow-up points" /></div></section>
    <section className="space-y-4 rounded-2xl border border-[#E0E7E2] bg-white p-5 shadow-sm sm:p-7"><div><h2 className="text-lg font-semibold">Verify and submit</h2><p className="mt-1 text-sm text-stone-600">Use the same 8-digit PIN you use for driver sign-on. Your PIN is checked securely and is not saved with this record.</p></div><div className="max-w-sm space-y-2"><Label htmlFor="vf-pin">Driver sign-on PIN</Label><Input id="vf-pin" type="password" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} minLength={8} value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,"").slice(0,8))} placeholder="8-digit PIN" required /></div><Button type="submit" disabled={busy||drivers.length===0||vehicleTypes.length===0||!vehicleRegistration||checked.length!==checklist.length} className="w-full bg-[#1D5C63] hover:bg-[#164B50] sm:w-auto">{busy?<><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Saving…</>:"Confirm vehicle familiarisation"}</Button></section>
  </form><p className="mt-5 text-center text-xs text-stone-500">Need help? Speak to your depot supervisor.</p></div></main>;
}
