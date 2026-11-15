import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { firebaseAuth, firebaseDb } from "@/lib/firebase";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { WorkEmailGate } from "@/components/WorkEmailGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localDateKey } from "@/lib/operations";
import { toast } from "sonner";

export default function CheltenhamSupervisor() {
  const { authUser, profile, loading, logout, createTeamMember } = useWorkspace();
  const [drivers, setDrivers] = useState<any[]>([]);
  const [signOns, setSignOns] = useState<any[]>([]);
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("Dale Griffiths");
  const [email, setEmail] = useState("dg@swanstravel.com");
  const [dob, setDob] = useState("");
  const [inviteBusy, setInviteBusy] = useState(false);
  const today = localDateKey();
  const demoPreview = new URLSearchParams(window.location.search).get("demo") === "1";

  useEffect(() => {
    if (!firebaseDb || !authUser || !profile || profile.memberRole !== "depot_supervisor" || profile.depotSlug !== "cheltenham") return;
    Promise.all([
      getDocs(query(collection(firebaseDb, "ops_drivers"), where("depot", "==", "cheltenham"), where("active", "==", true))),
      getDocs(query(collection(firebaseDb, "ops_driver_sign_ons"), where("depotSlug", "==", "cheltenham"), where("workDate", "==", today))),
    ]).then(([driverRows, signOnRows]) => {
      setDrivers(driverRows.docs.map(row => ({ ...row.data(), _docId: row.id })).sort((a,b) => String(a.name).localeCompare(String(b.name))));
      setSignOns(signOnRows.docs.map(row => ({ ...row.data(), _docId: row.id })).sort((a,b) => Number(b.createdAt||0)-Number(a.createdAt||0)));
    }).catch(() => toast.error("Cheltenham sign-on records could not be loaded."));
  }, [authUser, profile, today]);

  const duplicateIds = useMemo(() => {
    const flagged = new Set<string>();
    for (const item of signOns) for (const other of signOns) {
      if (item._docId !== other._docId && item.driverId !== other.driverId && item.deviceIdHash && item.deviceIdHash === other.deviceIdHash && Math.abs(Number(item.createdAt)-Number(other.createdAt)) <= 30*60*1000) {
        flagged.add(item._docId); flagged.add(other._docId);
      }
    }
    return flagged;
  }, [signOns]);

  const resetPin = async (driver: any) => {
    const date = window.prompt(`Enter ${driver.name}'s date of birth as DD/MM/YYYY to reset their PIN.`);
    if (date === null) return;
    const pin = date.replace(/\D/g, "");
    if (!/^\d{8}$/.test(pin)) return toast.error("Enter the date as DD/MM/YYYY.");
    if (!window.confirm(`Reset ${driver.name}'s sign-on PIN to this date of birth?`)) return;
    const user = firebaseAuth?.currentUser;
    if (!user) return toast.error("Please sign in again.");
    setBusy(driver._docId);
    try {
      const response = await fetch("/api/driver-sign-on", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + await user.getIdToken() }, body: JSON.stringify({ action: "issue-pin", driverId: driver._docId, pin }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "PIN reset failed.");
      toast.success(`${driver.name}'s PIN has been reset.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "PIN reset failed."); }
    finally { setBusy(""); }
  };

  if (loading) return <main className="min-h-screen grid place-items-center bg-stone-50">Loading secure sign-on…</main>;
  if (!authUser) return <WorkEmailGate />;
  if (profile?.memberRole === "lead" && demoPreview) return <main className="min-h-screen bg-stone-50 px-4 py-6 text-stone-900 sm:px-8"><header className="mx-auto flex max-w-5xl items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-800">Swans Travel · Driver sign-on</p><h1 className="mt-2 text-3xl font-semibold">Cheltenham supervisor</h1><p className="mt-1 text-stone-600">Today’s sign-ons, shared-device flags and driver PIN resets</p></div><a className="text-sm font-medium text-teal-800 underline" href="/cheltenham-supervisor">Back to invitation</a></header><div className="mx-auto mt-6 max-w-5xl rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"><strong>Demo preview</strong> · These names and sign-ons are examples only. Dale’s real page will show today’s Cheltenham records.</div><section className="mx-auto mt-6 grid max-w-5xl gap-6 lg:grid-cols-2"><div className="rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">Today’s Cheltenham sign-ons</h2><p className="mb-4 mt-1 text-sm text-stone-500">2 sign-ons today</p><ul className="divide-y"><li className="py-3"><div className="flex items-center justify-between gap-3"><strong>Example Driver A</strong><time className="text-sm text-stone-500">08:12</time></div><p className="mt-1 text-sm font-medium text-amber-700">⚠ This phone/browser was used to sign on another driver within 30 minutes.</p></li><li className="py-3"><div className="flex items-center justify-between gap-3"><strong>Example Driver B</strong><time className="text-sm text-stone-500">08:20</time></div><p className="mt-1 text-sm font-medium text-amber-700">⚠ This phone/browser was used to sign on another driver within 30 minutes.</p></li></ul></div><div className="rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">Cheltenham drivers</h2><p className="mb-4 mt-1 text-sm text-stone-500">Reset a driver’s PIN to their date of birth.</p>{["Example Driver A", "Example Driver B", "Example Driver C"].map(driver=><div key={driver} className="flex items-center justify-between gap-3 border-t py-3"><span>{driver}</span><Button size="sm" variant="outline" disabled>Reset PIN</Button></div>)}<p className="mt-2 text-xs text-stone-500">PIN reset is disabled in this demo.</p></div></section></main>;
  if (profile?.memberRole === "lead") return <main className="mx-auto max-w-xl p-6"><h1 className="mb-2 text-2xl font-semibold">Invite Cheltenham supervisor</h1><p className="mb-6 text-sm text-stone-600">This creates a restricted sign-on account. Dale will set his own password when he accepts by creating an account with his work email.</p><form className="space-y-4" onSubmit={async e => { e.preventDefault(); setInviteBusy(true); try { await createTeamMember({ displayName: name, email, jobTitle: "Cheltenham Supervisor", memberRole: "depot_supervisor", depotSlug: "cheltenham", initials: "DG", colour: "#1D5C63" }); toast.success("Cheltenham supervisor invitation saved. Dale can now create his own password."); } catch (error) { toast.error(error instanceof Error ? error.message : "Invitation could not be saved."); } finally { setInviteBusy(false); } }}><div><Label>Name</Label><Input value={name} onChange={e=>setName(e.target.value)} required /></div><div><Label>Work email</Label><Input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></div><Button disabled={inviteBusy}>{inviteBusy ? "Saving…" : "Create invitation"}</Button></form><p className="mt-6 text-xs text-stone-500">Send Dale this page address after the invitation is created: /cheltenham-supervisor</p><a className="mt-3 inline-block text-sm font-medium text-teal-800 underline" href="/cheltenham-supervisor?demo=1">Preview the supervisor dashboard</a></main>;
  if (profile?.memberRole !== "depot_supervisor" || profile.depotSlug !== "cheltenham") return <main className="min-h-screen p-8"><h1 className="text-2xl font-semibold">Access restricted</h1><p className="mt-2">This page is for the Cheltenham supervisor.</p></main>;

  return <main className="min-h-screen bg-stone-50 px-4 py-6 text-stone-900 sm:px-8"><header className="mx-auto flex max-w-5xl items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-800">Swans Travel · Driver sign-on</p><h1 className="mt-2 text-3xl font-semibold">Cheltenham supervisor</h1><p className="mt-1 text-stone-600">Today’s sign-ons, shared-device flags and driver PIN resets</p></div><Button variant="outline" onClick={() => void logout()}>Sign out</Button></header><section className="mx-auto mt-8 grid max-w-5xl gap-6 lg:grid-cols-2"><div className="rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">Today’s Cheltenham sign-ons</h2><p className="mb-4 mt-1 text-sm text-stone-500">{signOns.length} sign-on{signOns.length===1?"":"s"} today</p>{signOns.length===0?<p className="text-sm text-stone-500">No Cheltenham sign-ons recorded today.</p>:<ul className="divide-y">{signOns.map(item=><li key={item._docId} className="py-3"><div className="flex items-center justify-between gap-3"><strong>{item.driverName}</strong><time className="text-sm text-stone-500">{new Date(item.createdAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</time></div>{duplicateIds.has(item._docId)&&<p className="mt-1 text-sm font-medium text-amber-700">⚠ This phone/browser was used to sign on another driver within 30 minutes.</p>}</li>)}</ul>}</div><div className="rounded-xl border bg-white p-5"><h2 className="text-xl font-semibold">Cheltenham drivers</h2><p className="mb-4 mt-1 text-sm text-stone-500">Reset a driver’s PIN to their date of birth.</p>{drivers.map(driver=><div key={driver._docId} className="flex items-center justify-between gap-3 border-t py-3"><span>{driver.name}</span><Button size="sm" variant="outline" disabled={busy===driver._docId} onClick={()=>void resetPin(driver)}>{busy===driver._docId?"Resetting…":"Reset PIN"}</Button></div>)}</div></section></main>;
}
