import { useWorkspace } from "@/contexts/WorkspaceContext";
import { firebaseDb } from "@/lib/firebase";
import { addDoc, collection, onSnapshot, query, updateDoc, doc } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, FileUp, Search, ShieldCheck, Users } from "lucide-react";
import { PageHeader, LoadError } from "@/components/WorkspacePrimitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type ComplianceRecord = {
  _docId: string; driverName: string; licenceNumber?: string; licenceValidFrom?: string;
  licenceValidTo?: string; consentExpiry?: string; endorsements?: Array<{ offenceCode: string; points: number; offenceDate: string }>;
  updatedAt?: number; source?: string;
};
const normalise = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const parseDate = (value: string) => {
  const raw = value.trim(); if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/); if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const uk = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/); if (uk) return `${uk[3]}-${uk[2].padStart(2,"0")}-${uk[1].padStart(2,"0")}`;
  return "";
};
const daysUntil = (value?: string) => value ? Math.ceil((new Date(value+"T00:00:00").getTime()-new Date(new Date().toDateString()).getTime())/86400000) : null;
const dateLabel = (value?: string) => value ? new Date(value+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "Not recorded";
const statusFor = (value?: string) => { const days=daysUntil(value); if(days===null)return {label:"Missing",tone:"secondary"}; if(days<0)return {label:"Expired",tone:"destructive"}; if(days<=30)return {label:"Due within 30 days",tone:"destructive"}; if(days<=90)return {label:"Due within 90 days",tone:"outline"}; return {label:"In date",tone:"secondary"}; };

export default function ComplianceCentre() {
  const { profile, state, refresh } = useWorkspace();
  const [records,setRecords]=useState<ComplianceRecord[]>([]);
  const [search,setSearch]=useState("");
  const [importing,setImporting]=useState(false);
  const [preview,setPreview]=useState<{matched:number;unmatched:string[];ambiguous:string[];rows:any[]}|null>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  useEffect(()=>{ if(!firebaseDb)return; return onSnapshot(query(collection(firebaseDb,"ops_driver_compliance")),snap=>setRecords(snap.docs.map(item=>({_docId:item.id,...item.data()} as ComplianceRecord))),()=>toast.error("Compliance records could not be loaded.")); },[]);
  const drivers=useMemo(()=> (state.drivers||[]).filter((d:any)=>d.active!==false),[state.drivers]);
  const rows=useMemo(()=>drivers.map((driver:any)=>{
    const matches=records.filter(r=>normalise(r.driverName)===normalise(driver.name));
    const record=matches[0];
    return {driver,record,duplicate:matches.length>1};
  }).filter(item=>!search||item.driver.name.toLowerCase().includes(search.toLowerCase())),[drivers,records,search]);
  const expiring=rows.filter(x=>{const d=daysUntil(x.record?.licenceValidTo);return d!==null&&d>=0&&d<=90;}).length;
  const expired=rows.filter(x=>{const d=daysUntil(x.record?.licenceValidTo);return d!==null&&d<0;}).length;
  const missing=rows.filter(x=>!x.record?.licenceValidTo).length;
  const parseFile=async(file:File)=>{
    const text=await file.text(); const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);
    if(lines.length<2)return toast.error("The file does not contain any driver rows.");
    const delimiter=lines[0].includes("\t")?"\\t":",";
    const split=(line:string)=>line.split(delimiter).map(v=>v.trim().replace(/^"|"$/g,""));
    const headers=split(lines[0]).map(h=>h.toLowerCase());
    const index=(...names:string[])=>headers.findIndex(h=>names.includes(h));
    const nameIndex=index("licencesurname","surname","lastname");
    const firstIndex=index("licencefirstname","firstname","first name");
    const expiryIndex=index("licencevalidto","licence expiry","expiry date");
    const fromIndex=index("licencevalidfrom","valid from");
    const numberIndex=index("licencenumber","licence number");
    const consentIndex=index("consentexpiry","consent expiry");
    if(nameIndex<0||firstIndex<0||expiryIndex<0)return toast.error("Required columns missing. Include LICENCEFIRSTNAME, LICENCESURNAME and LICENCEVALIDTO.");
    const parsed=lines.slice(1).map(line=>{const cells=split(line);return {driverName:[cells[firstIndex],cells[nameIndex]].filter(Boolean).join(" "),licenceNumber:numberIndex>=0?cells[numberIndex]:"",licenceValidFrom:fromIndex>=0?parseDate(cells[fromIndex]||""):"",licenceValidTo:parseDate(cells[expiryIndex]||""),consentExpiry:consentIndex>=0?parseDate(cells[consentIndex]||""):""};}).filter(r=>r.driverName);
    const unmatched:string[]=[];const ambiguous:string[]=[];let matched=0;
    parsed.forEach(r=>{const found=drivers.filter((d:any)=>normalise(d.name)===normalise(r.driverName));if(found.length===1)matched++;else if(found.length>1)ambiguous.push(r.driverName);else unmatched.push(r.driverName);});
    setPreview({matched,unmatched,ambiguous,rows:parsed}); 
  };
  const saveImport=async()=>{
    if(!firebaseDb||!preview)return;
    setImporting(true);
    try{
      let saved=0;
      for(const row of preview.rows){
        const found=drivers.filter((d:any)=>normalise(d.name)===normalise(row.driverName));
        if(found.length!==1)continue;
        const existing=records.find(r=>normalise(r.driverName)===normalise(row.driverName));
        const payload={driverName:found[0].name,licenceNumber:row.licenceNumber||"",licenceValidFrom:row.licenceValidFrom||"",licenceValidTo:row.licenceValidTo||"",consentExpiry:row.consentExpiry||"",source:"licence-matrix-import",updatedAt:Date.now(),updatedBy:profile?.displayName||"Operations"};
        if(existing)await updateDoc(doc(firebaseDb,"ops_driver_compliance",existing._docId),payload);
        else await addDoc(collection(firebaseDb,"ops_driver_compliance"),{...payload,createdAt:Date.now(),endorsements:[]});
        saved++;
      }
      setPreview(null);toast.success(`${saved} driver compliance records imported.`);
    }catch(error){toast.error(error instanceof Error?error.message:"Import failed. No further records were processed.");}
    finally{setImporting(false);}
  };
  if(!profile)return <LoadError message="Sign in to view driver compliance." onRetry={()=>void refresh()}/>;
  return <div className="mx-auto max-w-[1450px] pb-10">
    <PageHeader eyebrow="Driver management" title="Compliance Centre" description="A central register for licence validity, consent dates and future endorsement monitoring." actions={<><input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void parseFile(f);e.currentTarget.value="";}}/><Button onClick={()=>fileRef.current?.click()}><FileUp className="mr-2 h-4 w-4"/>Import licence matrix</Button></>}/>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[{label:"Active drivers",value:drivers.length,icon:Users},{label:"Licences expiring in 90 days",value:expiring,icon:Clock3},{label:"Expired licences",value:expired,icon:AlertTriangle},{label:"Missing licence records",value:missing,icon:ShieldCheck}].map(item=><div key={item.label} className="rounded-2xl border border-[#DCE8E1] bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wide text-[#71817A]">{item.label}</p><item.icon className="h-5 w-5 text-[#66847A]"/></div><p className="mt-3 text-3xl font-semibold text-[#21312B]">{item.value}</p></div>)}
    </div>
    {preview&&<section className="mt-6 rounded-2xl border border-[#DCE8E1] bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-[#27362F]">Import review</h2><p className="mt-1 text-sm text-[#71817A]">Only exact name matches will be updated. Ambiguous and unmatched names will be skipped.</p></div><Badge variant="outline">{preview.matched} matched</Badge></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><p className="text-sm">Unmatched: <strong>{preview.unmatched.length}</strong> {preview.unmatched.slice(0,5).join(", ")}</p><p className="text-sm">Ambiguous: <strong>{preview.ambiguous.length}</strong> {preview.ambiguous.slice(0,5).join(", ")}</p></div><div className="mt-4 flex gap-2"><Button disabled={importing||!preview.matched} onClick={()=>void saveImport()}>{importing?"Importing…":"Confirm import"}</Button><Button variant="outline" onClick={()=>setPreview(null)}>Cancel</Button></div></section>}
    <section className="mt-6 rounded-2xl border border-[#E0E8E3] bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-[#27362F]">Driver compliance register</h2><p className="mt-1 text-xs text-[#78857F]">Driver names are used for matching. No Driver IDs are required.</p></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" placeholder="Search drivers…" value={search} onChange={e=>setSearch(e.target.value)}/></div></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-[#78857F]"><th className="py-3 pr-4">Driver</th><th className="py-3 pr-4">Licence expiry</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4">Consent expiry</th><th className="py-3 pr-4">Endorsements</th></tr></thead><tbody>{rows.map(({driver,record,duplicate})=>{const status=statusFor(record?.licenceValidTo);return <tr key={driver._docId} className="border-b border-[#EDF1EE]"><td className="py-3 pr-4 font-medium text-[#27362F]">{driver.name}{duplicate&&<span className="ml-2 text-xs text-red-600">Duplicate record</span>}</td><td className="py-3 pr-4">{dateLabel(record?.licenceValidTo)}</td><td className="py-3 pr-4"><Badge variant={status.tone as any}>{status.label}</Badge></td><td className="py-3 pr-4">{dateLabel(record?.consentExpiry)}</td><td className="py-3 pr-4">{record?.endorsements?.length||"Not checked"}</td></tr>})}</tbody></table></div>
      {!rows.length&&<div className="py-10 text-center text-sm text-muted-foreground">No drivers match this search.</div>}
    </section>
    <p className="mt-4 flex items-start gap-2 text-xs text-[#78857F]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>Importing updates the compliance register only. It does not alter the existing driver directory or the original spreadsheet.</p>
  </div>;
}
