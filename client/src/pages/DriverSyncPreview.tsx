import { useState } from "react";
import { firebaseAuth } from "@/lib/firebase";
import { PageHeader } from "@/components/WorkspacePrimitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, ShieldCheck, AlertTriangle } from "lucide-react";

type DateRow={key:string;label:string;action:string;opsDate?:string|null;gateDate?:string|null;latest?:string;updateOps?:boolean;updateGate?:boolean;reason?:string};
type PreviewRow={name:string;gateId:string;opsDriverId?:string;status:string;reason?:string;dates:DateRow[]};
type Preview={generatedAt:string;mode:string;totals:Record<string,number>;rows:PreviewRow[]};
const showDate=(value?:string|null)=>value?new Date(value+"T00:00:00").toLocaleDateString("en-GB"):"Not recorded";
export default function DriverSyncPreview(){
 const [preview,setPreview]=useState<Preview|null>(null); const [busy,setBusy]=useState(false); const [error,setError]=useState("");
 async function load(){
  setBusy(true);setError("");
  try{
   const user=firebaseAuth?.currentUser;if(!user)throw new Error("Sign in to Ops first.");
   const token=await user.getIdToken();
   const response=await fetch("/api/driver-sync-preview",{headers:{Authorization:"Bearer "+token}});
   const body=await response.json();if(!response.ok)throw new Error(body.error||"Unable to load preview.");
   setPreview(body);toast.success("Read-only comparison loaded.");
  }catch(e){const message=e instanceof Error?e.message:"Unable to load preview.";setError(message);toast.error(message);}
  finally{setBusy(false);}
 }
 return <div className="space-y-6">
  <PageHeader title="Driver compliance sync" description="Read-only comparison between Ops Command Centre and Gate Check. No records are changed."/>
  <div className="rounded-xl border bg-card p-4 flex gap-3 items-start"><ShieldCheck className="h-5 w-5 mt-0.5 text-emerald-600"/><div><div className="font-semibold">Preview only, no database writes</div><p className="text-sm text-muted-foreground mt-1">The comparison checks driving licence, Driver CPC and tachograph expiry dates. DVLA consent is deliberately excluded. Where dates differ, the later valid expiry is proposed as the winner.</p></div></div>
  <div className="flex items-center gap-3"><Button onClick={load} disabled={busy}><RefreshCw className={"h-4 w-4 mr-2 "+(busy?"animate-spin":"")}/>{busy?"Comparing records…":"Run comparison"}</Button><span className="text-sm text-muted-foreground">Restricted to the authorised Ops lead account.</span></div>
  {error&&<div className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">{error}</div>}
  {preview&&<>
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[["Gate Check drivers",preview.totals.gateDrivers],["Matched",preview.totals.matched],["Changes proposed",preview.totals.needingChanges],["Duplicates",preview.totals.duplicates],["Manual review",preview.totals.review+preview.totals.unmatched]].map(([label,value])=><div className="rounded-xl border bg-card p-4" key={String(label)}><div className="text-xs text-muted-foreground">{label}</div><div className="text-2xl font-semibold mt-1">{value}</div></div>)}</div>
   <div className="text-xs text-muted-foreground">Generated {new Date(preview.generatedAt).toLocaleString("en-GB")} · {preview.mode}</div>
   <div className="rounded-xl border bg-card overflow-hidden"><div className="p-4 border-b font-semibold">Driver comparison</div><div className="divide-y">{preview.rows.map(row=><div className="p-4 space-y-3" key={row.gateId}><div className="flex flex-wrap justify-between gap-2"><div><div className="font-semibold">{row.name}</div><div className="text-xs text-muted-foreground">Gate Check ref: {row.gateId}</div></div><Badge variant={row.status==="changes-preview"?"default":row.status==="matched"?"secondary":"destructive"}>{row.status.replaceAll("-"," ")}</Badge></div>{row.reason&&<div className="text-sm text-amber-700 flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0"/>{row.reason}</div>}{row.dates.map(date=><div className="grid gap-1 sm:grid-cols-[1fr_1fr_1fr] text-sm" key={date.key}><div className="font-medium">{date.label}</div><div className="text-muted-foreground">Ops: {showDate(date.opsDate)}</div><div className="text-muted-foreground">Gate Check: {showDate(date.gateDate)}</div>{date.latest&&<div className="sm:col-span-3 text-xs text-emerald-700">Latest expiry: {showDate(date.latest)}{date.updateOps?" · proposed update in Ops":""}{date.updateGate?" · proposed update in Gate Check":""}</div>}{date.reason&&<div className="sm:col-span-3 text-xs text-amber-700">{date.reason}</div>}</div>)}</div>)}</div></div>
  </>}
 </div>
}
