import { useWorkspace } from "@/contexts/WorkspaceContext";
import { firebaseAuth, firebaseDb } from "@/lib/firebase";
import { addDoc, collection, onSnapshot, query, updateDoc, doc } from "firebase/firestore";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, FileUp, Search, ShieldCheck, Users, Pencil, Plus, Save, X, Mail, UserX, ExternalLink } from "lucide-react";
import { PageHeader, LoadError } from "@/components/WorkspacePrimitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Endorsement = { offenceCode: string; points: number; offenceDate: string; expiryDate?: string; convictionDate?: string; description?: string; disqualified?: string; disqualificationEndDate?: string; createdAt?: number; };
type ComplianceRecord = {
  _docId: string; driverId?: string; driverName: string; licenceNumber?: string; licenceValidFrom?: string;
  licenceValidTo?: string; consentExpiry?: string; cpcExpiry?: string; cpcRiskGroup?: string; cpcPriority?: string; cpcBookingStatus?: string; cpcBookedCourseDate?: string; cpcCompletionDate?: string;
  tachoCardExpiry?: string; dbsDate?: string; trainingExpiry?: string; endorsements?: Endorsement[];
  section88ApplicationSentDate?: string; section88DvlaReceivedDate?: string; section88EvidenceType?: string; section88TrackingReference?: string; section88EvidenceReceived?: boolean; section88Confirmed?: boolean; section88CheckedBy?: string; section88CheckedAt?: number; section88Ended?: boolean; section88EndReason?: string;
  notes?: string; updatedAt?: number; source?: string;
};
type ComplianceForm = Omit<ComplianceRecord, "_docId" | "updatedAt" | "source">;
const emptyForm = (driverId: string, driverName: string): ComplianceForm => ({
  driverId, driverName, licenceNumber: "", licenceValidFrom: "", licenceValidTo: "", consentExpiry: "",
  cpcExpiry: "", tachoCardExpiry: "", dbsDate: "", trainingExpiry: "", endorsements: [], notes: "",
  section88ApplicationSentDate: "", section88DvlaReceivedDate: "", section88EvidenceType: "recorded-delivery", section88TrackingReference: "", section88EvidenceReceived: false, section88Confirmed: false, section88CheckedBy: "", section88Ended: false, section88EndReason: ""
});
const normalise = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const nameKey = (value: string) => { const parts=normalise(value).split(" ").filter(Boolean); return parts.length>1 ? `${parts[0]} ${parts[parts.length-1]}` : parts[0]||""; };
const excludedCpcNames = new Set(["joanne marshall","krzysztof rojek","steven woodward","keith merrick","jordan sharples"]);
const endorsementNameAliases: Record<string,string> = { "c tilson":"coral tilson" };
const excludedEndorsementDriverIds = new Set(["487","welby m"]);
const cpcAliases: Record<string,string> = { "mike todd":"michael todd", "michael todd":"mike todd", "tom sayce":"thomas sayce", "sale griffiths":"dale griffiths", "craig hobin":"steven craig hobin", "andrew ellis":"andy ellis", "patrick nottage":"pat nottage", "stephen hobin":"craig hobin", "mccall aaron":"aaron mccall", "steven king":"steve king", "carleam nuttall":"carl nuttall", "darren lewis":"darren lewis" };
const parseDate = (value: string) => {
  const raw = value.trim(); if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (iso) return iso[0];
  const uk = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (uk) { const day = Number(uk[1]), month = Number(uk[2]), year = Number(uk[3]); const date = new Date(year, month - 1, day); if (date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day) return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`; }
  return "";
};
const parseCsv = (source: string, delimiter: string) => {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
  for (let i = 0; i < source.length; i++) { const char = source[i]; if (char === '"' && quoted && source[i + 1] === '"') { cell += '"'; i++; } else if (char === '"') quoted = !quoted; else if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ""; } else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && source[i + 1] === "\n") i++; row.push(cell.trim()); if (row.some(value => value !== "")) rows.push(row); row = []; cell = ""; } else cell += char; }
  row.push(cell.trim()); if (row.some(value => value !== "")) rows.push(row); return rows;
};
const daysUntil = (value?: string) => {
  if(typeof value!=="string"||!value.trim())return null;
  const match=value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return null;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const expiry=Date.UTC(year,month-1,day);
  if(new Date(expiry).getUTCFullYear()!==year||new Date(expiry).getUTCMonth()!==month-1||new Date(expiry).getUTCDate()!==day)return null;
  const today=new Date();
  const todayUtc=Date.UTC(today.getFullYear(),today.getMonth(),today.getDate());
  return Math.round((expiry-todayUtc)/86400000);
};
const dateLabel = (value?: string) => value ? new Date(value+"T00:00:00").toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}) : "Not recorded";
const statusFor = (value?: string) => { const days=daysUntil(value); if(days===null)return {label:"Missing",tone:"secondary"}; if(days<0)return {label:"Expired",tone:"destructive"}; if(days<=30)return {label:"Due within 30 days",tone:"destructive"}; if(days<=90)return {label:"Due within 90 days",tone:"outline"}; return {label:"In date",tone:"secondary"}; };
const complianceDates = ["licenceValidTo","consentExpiry","cpcExpiry","tachoCardExpiry","trainingExpiry"] as const;
const complianceLabels:Record<(typeof complianceDates)[number],string>={licenceValidTo:"Driving licence",consentExpiry:"DVLA consent",cpcExpiry:"Driver CPC",tachoCardExpiry:"Tachograph card",trainingExpiry:"Training"};
const isSection88Active=(record?:ComplianceRecord)=>{
  if(!record||!record.section88Confirmed||!record.section88EvidenceReceived||record.section88Ended||!record.section88DvlaReceivedDate)return false;
  const daysSinceReceipt=daysUntil(record.section88DvlaReceivedDate);
  return daysSinceReceipt!==null&&daysSinceReceipt<=0&&daysSinceReceipt>=-365;
};
const complianceAlerts=(record?:ComplianceRecord)=>{
  if(!record)return [];
  return complianceDates.filter(key=>!(key==="licenceValidTo"&&isSection88Active(record))).flatMap(key=>{
    const days=daysUntil(record[key]);
    return days!==null&&days<=90?[{key,label:complianceLabels[key],date:record[key]!,days,expired:days<0}]:[];
  }).sort((a,b)=>a.days-b.days);
};

export default function ComplianceCentre() {
  const { profile, state, refresh, error: workspaceError } = useWorkspace();
  const [records,setRecords]=useState<ComplianceRecord[]>([]);
  const [search,setSearch]=useState("");
  const [activeFilter,setActiveFilter]=useState<"all"|"due"|"expired"|"missing">("all");
  const registerRef=useRef<HTMLElement>(null);
  const [importing,setImporting]=useState(false);
  const [preview,setPreview]=useState<{matched:number;unmatched:string[];ambiguous:string[];invalid:number;rows:any[]}|null>(null);
  const [manualMatches,setManualMatches]=useState<Record<string,string>>({});
  const [selected,setSelected]=useState<any|null>(null);
  const [form,setForm]=useState<ComplianceForm|null>(null);
  const [saving,setSaving]=useState(false);
  const [endorsement,setEndorsement]=useState<Endorsement>({offenceCode:"",points:3,offenceDate:"",expiryDate:""});
  const fileRef=useRef<HTMLInputElement>(null);
  const endorsementFileRef=useRef<HTMLInputElement>(null);
  const [importingEndorsements,setImportingEndorsements]=useState(false);
  const [importingTacho,setImportingTacho]=useState(false);
  const tachoFileRef=useRef<HTMLInputElement>(null);
  const [sendingTestEmail,setSendingTestEmail]=useState(false);
  useEffect(()=>{
    if(!firebaseDb)return;
    console.info("[Firestore read audit]", { time:new Date().toISOString(), page:window.location.pathname, event:"listener-attached", collection:"ops_driver_compliance" });
    let firstSnapshot=true;
    const unsubscribe=onSnapshot(query(collection(firebaseDb,"ops_driver_compliance")),snap=>{
      const changes=snap.docChanges();
      console.info("[Firestore read audit]", {
        time:new Date().toISOString(), page:window.location.pathname,
        event:firstSnapshot?"initial-snapshot":"snapshot-update",
        collection:"ops_driver_compliance", documentsInSnapshot:snap.size,
        changedDocuments:changes.length,
        added:changes.filter(change=>change.type==="added").length,
        modified:changes.filter(change=>change.type==="modified").length,
        removed:changes.filter(change=>change.type==="removed").length
      });
      firstSnapshot=false;
      setRecords(snap.docs.map(item=>({_docId:item.id,...item.data()} as ComplianceRecord)));
    },()=>toast.error("Compliance records could not be loaded."));
    return ()=>{ unsubscribe(); console.info("[Firestore read audit]", { time:new Date().toISOString(), page:window.location.pathname, event:"listener-detached", collection:"ops_driver_compliance" }); };
  },[]);
  const allDrivers=useMemo(()=>state.drivers||[],[state.drivers]);
  const drivers=useMemo(()=> allDrivers.filter((d:any)=>d.active!==false).sort((a:any,b:any)=>a.name.localeCompare(b.name)),[allDrivers]);
  const automaticDriverMatch=(row:any)=>{const byId=row.sourceDriverId?drivers.filter((d:any)=>[d.id,d.driverId,d.driverCode].some(value=>value!==undefined&&String(value).trim()===row.sourceDriverId)):[];if(byId.length)return byId;const target=cpcAliases[nameKey(row.driverName)]||nameKey(row.driverName);return drivers.filter((d:any)=>nameKey(d.name)===target);};
  const importDriverFor=(row:any)=>{const automatic=automaticDriverMatch(row);if(automatic.length===1)return automatic[0];const chosen=manualMatches[row.driverName];return chosen?drivers.find((d:any)=>d._docId===chosen):undefined;};
  const readyToImport=preview?preview.rows.filter((row:any)=>!excludedCpcNames.has(nameKey(row.driverName))&&row.licenceValidTo&&!!importDriverFor(row)).length:0;
  const needsManualMatch=preview?preview.rows.filter((row:any)=>!excludedCpcNames.has(nameKey(row.driverName))&&row.licenceValidTo&&automaticDriverMatch(row).length!==1):[];
  const rows=useMemo(()=>drivers.map((driver:any)=>{
    const matches=records.filter(r=>(r.driverId&&r.driverId===driver._docId)||normalise(r.driverName)===normalise(driver.name));
    return {driver,record:matches[0],duplicate:matches.length>1};
  }).filter(item=>!search||item.driver.name.toLowerCase().includes(search.toLowerCase())),[drivers,records,search]);
  const expiring=rows.filter(x=>complianceAlerts(x.record).some(alert=>!alert.expired)).length;
  const expired=rows.filter(x=>complianceAlerts(x.record).some(alert=>alert.expired)).length;
  const missing=rows.filter(x=>!x.record?.licenceValidTo).length;
  const filteredRows=useMemo(()=>rows.filter(x=>{const alerts=complianceAlerts(x.record);if(activeFilter==="due")return alerts.some(alert=>!alert.expired);if(activeFilter==="expired")return alerts.some(alert=>alert.expired);if(activeFilter==="missing")return !x.record?.licenceValidTo;return true;}).sort((a,b)=>{
    const urgency=(item:typeof rows[number])=>{
      const alerts=complianceAlerts(item.record);
      if(alerts.some(alert=>alert.expired))return 0;
      if(alerts.some(alert=>alert.days<=30))return 1;
      if(alerts.some(alert=>alert.days<=90))return 2;
      if(!item.record?.licenceValidTo)return 3;
      return 4;
    };
    const daysToNextExpiry=(item:typeof rows[number])=>{
      const alerts=complianceAlerts(item.record);
      return alerts.length?Math.min(...alerts.map(alert=>alert.days)):Number.POSITIVE_INFINITY;
    };
    return urgency(a)-urgency(b)||daysToNextExpiry(a)-daysToNextExpiry(b)||a.driver.name.localeCompare(b.driver.name);
  }),[rows,activeFilter]);
  const selectFilter=(filter:"all"|"due"|"expired"|"missing")=>{setActiveFilter(filter);setSearch("");window.setTimeout(()=>registerRef.current?.scrollIntoView({behavior:"smooth",block:"start"}),50);};
  const openEditor=(driver:any,record?:ComplianceRecord)=>{setSelected(driver);setForm(record?{...emptyForm(driver._docId,driver.name),...record,driverId:driver._docId,driverName:driver.name}:emptyForm(driver._docId,driver.name));setEndorsement({offenceCode:"",points:3,offenceDate:"",expiryDate:""});};
  const closeEditor=()=>{setSelected(null);setForm(null);};
  const saveRecord=async()=>{if(!firebaseDb||!profile||!selected||!form)return;if(form.section88Confirmed&&(!form.section88ApplicationSentDate||!form.section88DvlaReceivedDate||!form.section88EvidenceReceived||!form.section88EvidenceType)){toast.error("To confirm Section 88, record the application date and evidence received first.");return;}if(!form.licenceValidTo){toast.error("Enter the driving licence expiry date, or leave this record unsaved until confirmed.");return;}setSaving(true);try{
    const payload:any={...form,driverId:selected._docId,driverName:selected.name,endorsements:form.endorsements||[],section88CheckedBy:form.section88Confirmed?(profile.displayName||profile.userId):"",section88CheckedAt:form.section88Confirmed?(form.section88CheckedAt||Date.now()):undefined,updatedAt:Date.now(),updatedBy:profile.displayName||profile.userId};Object.keys(payload).forEach(key=>{if(payload[key]===undefined)delete payload[key];});
    const existing=records.find(r=>r.driverId===selected._docId)||records.find(r=>normalise(r.driverName)===normalise(selected.name));
    if(existing)await updateDoc(doc(firebaseDb,"ops_driver_compliance",existing._docId),payload);else await addDoc(collection(firebaseDb,"ops_driver_compliance"),{...payload,createdAt:Date.now(),createdBy:profile.displayName||profile.userId});
    await refresh();closeEditor();toast.success("Driver compliance record saved.");
  }catch(error){toast.error(error instanceof Error?error.message:"Compliance record could not be saved.");}finally{setSaving(false);}};
  const markDriverInactive=async()=>{
    if(!firebaseDb||!profile||!selected)return;
    if(!["lead","manager"].includes(profile.memberRole)){toast.error("Only a lead or manager can change a driver's employment status.");return;}
    if(!window.confirm(`Mark ${selected.name} as inactive? They will be removed from active driver lists, but all historical records will be retained.`))return;
    try{
      await updateDoc(doc(firebaseDb,"ops_drivers",selected._docId),{active:false,employmentStatus:"inactive",inactiveAt:Date.now(),inactiveBy:profile.displayName||profile.userId,updatedAt:Date.now()});
      await refresh();
      closeEditor();
      toast.success(`${selected.name} moved to inactive drivers. Historical records have been retained.`);
    }catch(error){toast.error(error instanceof Error?error.message:"Driver could not be marked inactive.");}
  };
  const addEndorsement=()=>{if(!form||!endorsement.offenceCode.trim()||!endorsement.offenceDate||!Number.isFinite(endorsement.points)||endorsement.points<1||endorsement.points>11){toast.error("Enter the offence code, date and points (1 to 11).");return;}setForm({...form,endorsements:[...(form.endorsements||[]),{...endorsement,offenceCode:endorsement.offenceCode.trim().toUpperCase(),createdAt:Date.now()}]});setEndorsement({offenceCode:"",points:3,offenceDate:"",expiryDate:""});};
  const importEndorsementFile=async(file:File)=>{
    if(!firebaseDb||!profile)return;
    setImportingEndorsements(true);
    try{
      const source=(await file.text()).replace(/^\uFEFF/,"");
      const delimiter=source.split(/\r?\n/,1)[0]?.includes("\t")?"\t":",";
      const table=parseCsv(source,delimiter);
      if(table.length<2)throw new Error("The endorsement file contains no data rows.");
      const headers=table[0].map(h=>h.toLowerCase().replace(/[^a-z0-9]/g,""));
      const idx=(...names:string[])=>headers.findIndex(h=>names.includes(h));
      const idCol=idx("driverid","drivercode");
      const nameCol=idx("drivername","name","fullname");
      const codeCol=idx("endorsementcode","offencecode","code");
      const offenceCol=idx("offencedate");
      const convictionCol=idx("convictiondate");
      const pointsCol=idx("points");
      const expiryCol=idx("pointsexpiry","expirydate");
      const descriptionCol=idx("description");
      const disqualifiedCol=idx("disqualified");
      const disqualificationEndCol=idx("disqualificationenddate");
      if(idCol<0||codeCol<0||offenceCol<0||pointsCol<0||expiryCol<0)throw new Error("Required columns missing. Include DriverID, EndorsementCode, OffenceDate, Points and PointsExpiry.");
      const parsed=table.slice(1).map((cells,index)=>({
        line:index+2,driverId:(cells[idCol]||"").trim(),driverName:nameCol>=0?(cells[nameCol]||"").trim():"",code:(cells[codeCol]||"").trim().toUpperCase(),
        offenceDate:parseDate(cells[offenceCol]||""),convictionDate:convictionCol>=0?parseDate(cells[convictionCol]||""):"",
        points:Number(cells[pointsCol]),expiryDate:parseDate(cells[expiryCol]||""),
        description:descriptionCol>=0?(cells[descriptionCol]||""):"",
        disqualified:disqualifiedCol>=0?(cells[disqualifiedCol]||""):"",
        disqualificationEndDate:disqualificationEndCol>=0?parseDate(cells[disqualificationEndCol]||""):""
      })).filter(row=>row.driverId||row.code);
      let imported=0,alreadyPresent=0,excluded=0,unmatched:string[]=[];
      const byDriver=new Map<string,any>();
      for(const row of parsed){
        if(excludedEndorsementDriverIds.has(row.driverId.trim().toLowerCase())||["steven poolton","marcus welby"].includes(nameKey(row.driverName))){excluded++;continue;}
        if(!row.driverId||!row.code||!row.offenceDate||!row.expiryDate||!Number.isInteger(row.points)||row.points<1||row.points>11)throw new Error("Invalid endorsement data on CSV line "+row.line+". Check the driver ID, dates and points.");
        const idMatches=allDrivers.filter((d:any)=>[d.id,d.driverId,d.driverCode].some(value=>value!==undefined&&String(value).trim().toLowerCase()===row.driverId.toLowerCase()));
        const resolvedName=endorsementNameAliases[nameKey(row.driverName)]||nameKey(row.driverName);
        const nameMatches=row.driverName?allDrivers.filter((d:any)=>nameKey(d.name)===resolvedName||nameKey(d.name).endsWith(" "+resolvedName)):[];
        const driver=idMatches.length===1?idMatches[0]:idMatches.length>1?undefined:nameMatches.length===1?nameMatches[0]:undefined;
        if(!driver){unmatched.push(row.driverId+(row.driverName?" / "+row.driverName:"")+" (line "+row.line+")");continue;}
        const key=driver._docId;
        if(!byDriver.has(key))byDriver.set(key,{driver,rows:[]});
        byDriver.get(key).rows.push(row);
      }
      for(const {driver,rows:driverRows} of byDriver.values()){
        const existing=records.find(r=>r.driverId===driver._docId)||records.find(r=>normalise(r.driverName)===normalise(driver.name));
        const previous=existing||emptyForm(driver._docId,driver.name);
        const endorsements=[...(previous.endorsements||[])];
        for(const row of driverRows){
          const duplicate=endorsements.some(item=>item.offenceCode.toUpperCase()===row.code&&item.offenceDate===row.offenceDate&&Number(item.points)===row.points);
          if(duplicate){alreadyPresent++;continue;}
          endorsements.push({offenceCode:row.code,points:row.points,offenceDate:row.offenceDate,expiryDate:row.expiryDate,convictionDate:row.convictionDate,description:row.description,disqualified:row.disqualified,disqualificationEndDate:row.disqualificationEndDate,createdAt:Date.now()});
          imported++;
        }
        if(endorsements.length===(previous.endorsements||[]).length)continue;
        const now=Date.now();
        const payload={...previous,driverId:driver._docId,driverName:driver.name,endorsements,source:"coach-manager-endorsement-import",updatedAt:now,updatedBy:profile.displayName||profile.userId};
        if(existing)await updateDoc(doc(firebaseDb,"ops_driver_compliance",existing._docId),payload);
        else await addDoc(collection(firebaseDb,"ops_driver_compliance"),{...payload,createdAt:now,createdBy:profile.displayName||profile.userId});
      }
      await refresh();
      const summary=imported+" endorsements imported, "+alreadyPresent+" already present, "+excluded+" excluded (former drivers)"+(unmatched.length?", "+unmatched.length+" unmatched IDs":"")+".";
      if(unmatched.length)toast.warning(summary+" Unmatched: "+unmatched.join(", "));
      else toast.success(summary);
    }catch(error){toast.error(error instanceof Error?error.message:"Endorsement import failed.");}
    finally{setImportingEndorsements(false);}
  };
  const importTachoFile=async(file:File)=>{
    if(!firebaseDb||!profile)return;
    setImportingTacho(true);
    try{
      const source=(await file.text()).replace(/^\uFEFF/,"");
      const delimiter=source.split(/\r?\n/,1)[0]?.includes("\t")?"\t":",";
      const table=parseCsv(source,delimiter);
      if(table.length<2)throw new Error("The tachograph file contains no data rows.");
      const headers=table[0].map(h=>h.toLowerCase().replace(/[^a-z0-9]/g,""));
      const idx=(...names:string[])=>headers.findIndex(h=>names.includes(h));
      const idCol=idx("driverid","drivercode","fleetdriverid");
      const firstCol=idx("firstname","driverfirstname","drivername","name");
      const surnameCol=idx("surname","lastname","driversurname");
      const expiryCol=idx("validto","cardvalidto","tachocardexpiry","expirydate");
      if(idCol<0||expiryCol<0)throw new Error("Required columns missing. Include DriverID and ValidTo.");
      const rows=table.slice(1).map((cells,index)=>{
        const driverId=(cells[idCol]||"").trim();
        const first=firstCol>=0?(cells[firstCol]||"").trim():"";
        const surname=surnameCol>=0?(cells[surnameCol]||"").trim():"";
        const driverName=surname?[first,surname].filter(Boolean).join(" "):first;
        const raw=(cells[expiryCol]||"").trim();
        return {line:index+2,driverId,driverName,expiry:parseDate(raw),raw};
      }).filter(row=>row.driverId||row.driverName||row.raw);
      if(!rows.length)throw new Error("No tachograph card records found.");
      const invalid=rows.filter(row=>!row.expiry);
      if(invalid.length)throw new Error("Import stopped: missing or invalid ValidTo date on CSV line(s) "+invalid.slice(0,8).map(row=>row.line).join(", ")+". No records changed.");
      const grouped=new Map<string,{driver:any;dates:Set<string>}>();
      const unmatched:string[]=[];
      const ambiguous:string[]=[];
      for(const row of rows){
        const byId=drivers.filter((d:any)=>[d.id,d.driverId,d.driverCode].some(v=>v!==undefined&&String(v).trim().toLowerCase()===row.driverId.toLowerCase()));
        const byName=row.driverName?drivers.filter((d:any)=>nameKey(d.name)===nameKey(row.driverName)):[];
        const matches=byId.length?byId:byName;
        if(matches.length!==1){
          const label=(row.driverId||"No ID")+(row.driverName?" / "+row.driverName:"");
          (matches.length>1?ambiguous:unmatched).push(label);
          continue;
        }
        const driver=matches[0];
        if(!grouped.has(driver._docId))grouped.set(driver._docId,{driver,dates:new Set<string>()});
        grouped.get(driver._docId)!.dates.add(row.expiry);
      }
      const conflicts=[...grouped.values()].filter(item=>item.dates.size!==1);
      const safe=[...grouped.values()].filter(item=>item.dates.size===1);
      if(!safe.length)throw new Error("No safe driver matches found. No records were changed.");
      const confirmed=window.confirm("TACHOGRAPH CARD IMPORT REVIEW\\n\\n"+safe.length+" drivers ready to update\\n"+unmatched.length+" unmatched\\n"+ambiguous.length+" ambiguous\\n"+conflicts.length+" conflicting date groups\\n\\nOnly tachograph card expiry will be changed. Other compliance details will be retained. Continue?");
      if(!confirmed)return;
      let updated=0;
      for(const item of safe){
        const existing=records.find(r=>r.driverId===item.driver._docId)||records.find(r=>normalise(r.driverName)===normalise(item.driver.name));
        const previous=existing||emptyForm(item.driver._docId,item.driver.name);
        const payload={...previous,driverId:item.driver._docId,driverName:item.driver.name,tachoCardExpiry:[...item.dates][0],source:"tachograph-card-import",updatedAt:Date.now(),updatedBy:profile.displayName||profile.userId};
        if(existing)await updateDoc(doc(firebaseDb,"ops_driver_compliance",existing._docId),payload);
        else await addDoc(collection(firebaseDb,"ops_driver_compliance"),{...payload,createdAt:Date.now(),createdBy:profile.displayName||profile.userId});
        updated++;
      }
      await refresh();
      const summary=updated+" tachograph card dates updated. "+unmatched.length+" unmatched, "+ambiguous.length+" ambiguous, "+conflicts.length+" conflicting groups left unchanged.";
      if(unmatched.length||ambiguous.length||conflicts.length)toast.warning(summary);
      else toast.success(summary);
    }catch(error){toast.error(error instanceof Error?error.message:"Tachograph card import failed.");}
    finally{setImportingTacho(false);}
  };
  const parseFile=async(file:File)=>{
    const source=(await file.text()).replace(/^\uFEFF/,"");const delimiter=source.split(/\r?\n/,1)[0]?.includes("\t")?"\t":",";const table=parseCsv(source,delimiter);
    if(table.length<2)return toast.error("The file does not contain any driver rows.");
    const headers=table[0].map(h=>h.toLowerCase().replace(/[^a-z0-9]/g,""));
    const index=(...names:string[])=>headers.findIndex(h=>names.includes(h));
    const sourceId=index("driverid","drivercode","fleetdriverid");const first=index("licencefirstname","firstname","drivername","name");const surname=index("licencesurname","surname","lastname");const expiry=index("licencevalidto","licenceexpiry","expirydate");const from=index("licencevalidfrom","validfrom");const number=index("licencenumber","drivinglicencenumber");const consent=index("consentexpiry","consentvalidto");const cpc=index("cpcexpirypcv","cpcexpiry","cpcvalidto");const risk=index("riskgroup");const priority=index("priority");const booking=index("bookingstatus");const booked=index("bookedcoursedate");const completed=index("completiondate");
    if(first<0||expiry<0)return toast.error("Required columns missing. Include a driver name and LICENCEVALIDTO.");
    let invalid=0;const parsed=table.slice(1).map(cells=>{const driverName=(surname>=0?[cells[first],cells[surname]].filter(Boolean).join(" "):cells[first]||"").trim();const rawExpiry=cells[expiry]||"";const licenceValidTo=parseDate(rawExpiry);if(rawExpiry&&!licenceValidTo)invalid++;return {sourceDriverId:sourceId>=0?(cells[sourceId]||"").trim():"",driverName,licenceNumber:number>=0?cells[number]||"": "",licenceValidFrom:from>=0?parseDate(cells[from]||""):"",licenceValidTo,consentExpiry:consent>=0?parseDate(cells[consent]||""):"",cpcExpiry:cpc>=0?parseDate(cells[cpc]||""):"",cpcRiskGroup:risk>=0?cells[risk]||"": "",cpcPriority:priority>=0?cells[priority]||"": "",cpcBookingStatus:booking>=0?cells[booking]||"": "",cpcBookedCourseDate:booked>=0?parseDate(cells[booked]||""):"",cpcCompletionDate:completed>=0?parseDate(cells[completed]||""):""};}).filter(r=>r.driverName);
    const unmatched:string[]=[];const ambiguous:string[]=[];let matched=0;
    parsed.forEach(r=>{if(excludedCpcNames.has(nameKey(r.driverName)))return;const byId=r.sourceDriverId?drivers.filter((d:any)=>[d.id,d.driverId,d.driverCode].some(value=>value!==undefined&&String(value).trim()===r.sourceDriverId)):[];const target=cpcAliases[nameKey(r.driverName)]||nameKey(r.driverName);const found=byId.length?byId:drivers.filter((d:any)=>nameKey(d.name)===target);if(found.length===1&&r.licenceValidTo)matched++;else if(found.length>1)ambiguous.push(r.driverName);else if(!found.length)unmatched.push(r.driverName);});
    setManualMatches({});setPreview({matched,unmatched,ambiguous,invalid,rows:parsed});
  };
  const saveImport=async()=>{if(!firebaseDb||!preview)return;setImporting(true);try{let saved=0;for(const row of preview.rows){if(excludedCpcNames.has(nameKey(row.driverName)))continue;const chosen=manualMatches[row.driverName];const found=chosen?drivers.filter((d:any)=>d._docId===chosen):automaticDriverMatch(row);if(found.length!==1||!row.licenceValidTo)continue;const existing=records.find(r=>r.driverId===found[0]._docId)||records.find(r=>normalise(r.driverName)===normalise(row.driverName));const previous=existing||emptyForm(found[0]._docId,found[0].name);const payload={...previous,driverId:found[0]._docId,driverName:found[0].name,licenceNumber:row.licenceNumber||previous.licenceNumber||"",licenceValidFrom:row.licenceValidFrom||previous.licenceValidFrom||"",licenceValidTo:row.licenceValidTo,consentExpiry:row.consentExpiry||previous.consentExpiry||"",cpcExpiry:row.cpcExpiry||previous.cpcExpiry||"",cpcRiskGroup:row.cpcRiskGroup||previous.cpcRiskGroup||"",cpcPriority:row.cpcPriority||previous.cpcPriority||"",cpcBookingStatus:row.cpcBookingStatus||previous.cpcBookingStatus||"",cpcBookedCourseDate:row.cpcBookedCourseDate||previous.cpcBookedCourseDate||"",cpcCompletionDate:row.cpcCompletionDate||previous.cpcCompletionDate||"",source:"licence-cpc-matrix-import",updatedAt:Date.now(),updatedBy:profile?.displayName||"Operations"};if(existing)await updateDoc(doc(firebaseDb,"ops_driver_compliance",existing._docId),payload);else await addDoc(collection(firebaseDb,"ops_driver_compliance"),{...payload,createdAt:Date.now()});saved++;}setPreview(null);setManualMatches({});await refresh();toast.success(`${saved} driver compliance records imported. Existing fields not present in the file were retained.`);}catch(error){toast.error(error instanceof Error?error.message:"Import failed. Some earlier rows may already have been saved, check the register before retrying.");}finally{setImporting(false);}};
  if(workspaceError)return <LoadError message={`Compliance data could not be loaded: ${workspaceError.message}`} onRetry={()=>void refresh()}/>;
  if(!profile)return <LoadError message="Sign in to view driver compliance." onRetry={()=>void refresh()}/>;
  const sendTestEmail=async()=>{
    const user=firebaseAuth?.currentUser;
    if(!user||profile.memberRole!=="lead"||user.email?.trim().toLowerCase()!=="bc@swanstravel.com"){toast.error("Only the operations lead can send the test email.");return;}
    setSendingTestEmail(true);
    try{
      const idToken=await user.getIdToken();
      const result=await fetch("/api/driver-compliance-alerts",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+idToken},body:JSON.stringify({})});
      const body=await result.json().catch(()=>({}));
      if(!result.ok||body.status!=="sent")throw new Error(body.error||"The test email could not be sent.");
      toast.success("Test compliance email sent to bc@swanstravel.com only.");
    }catch(error){toast.error(error instanceof Error?error.message:"Test email failed.");}
    finally{setSendingTestEmail(false);}
  };
  const totalPoints=(form?.endorsements||[]).reduce((sum,item)=>sum+Number(item.points||0),0);
  return <div className="mx-auto max-w-[1450px] pb-10">
    <header className="relative overflow-hidden rounded-2xl bg-[#102F46] px-5 py-6 text-white shadow-[0_18px_38px_-22px_rgba(16,47,70,0.72)] sm:px-7 sm:py-7"><div className="pointer-events-none absolute -right-12 -top-16 h-48 w-48 rounded-full border-[28px] border-[#35C9C3]/10"/><div className="relative flex flex-col gap-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#9DE8E5]">Driver management</p><h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-white sm:text-3xl">Compliance Centre</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#C8DCE7]">Manage licence, CPC, tachograph, DBS, training and endorsement records.</p></div><div className="flex flex-wrap gap-2">{profile.memberRole==="lead"&&<Button variant="outline" className="h-10 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white" disabled={sendingTestEmail} onClick={()=>void sendTestEmail()}><Mail className="mr-2 h-4 w-4"/>{sendingTestEmail?"Sending test…":"Send test email"}</Button>}<input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void parseFile(f);e.currentTarget.value="";}}/><input ref={endorsementFileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void importEndorsementFile(f);e.currentTarget.value="";}}/><input ref={tachoFileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f)void importTachoFile(f);e.currentTarget.value="";}}/><Button variant="outline" className="h-10 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={()=>fileRef.current?.click()}><FileUp className="mr-2 h-4 w-4"/>Import licence + CPC CSV</Button><Button variant="outline" className="h-10 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white" disabled={importingEndorsements} onClick={()=>endorsementFileRef.current?.click()}><FileUp className="mr-2 h-4 w-4"/>{importingEndorsements?"Importing…":"Import endorsements"}</Button><Button variant="outline" className="h-10 border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white" disabled={importingTacho} onClick={()=>tachoFileRef.current?.click()}><FileUp className="mr-2 h-4 w-4"/>{importingTacho?"Importing…":"Import tachograph cards"}</Button><Button className="h-10 bg-[#35C9C3] text-[#102F46] hover:bg-[#9DE8E5]" onClick={()=>drivers[0]&&openEditor(drivers[0])}><Plus className="mr-2 h-4 w-4"/>Add record</Button></div></div></header>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[{label:"Active drivers",value:drivers.length,icon:Users,filter:"all" as const,accent:"border-t-4 border-t-[#2B8E91]",iconTone:"bg-sky-100 text-[#167E8A]",valueTone:"text-[#102F46]"},{label:"Records due within 90 days",value:expiring,icon:Clock3,filter:"due" as const,accent:"border-t-4 border-t-amber-400",iconTone:"bg-amber-100 text-amber-700",valueTone:"text-amber-950"},{label:"Expired compliance dates",value:expired,icon:AlertTriangle,filter:"expired" as const,accent:"border-t-4 border-t-rose-500",iconTone:"bg-rose-100 text-rose-700",valueTone:"text-rose-950"},{label:"Missing licence records",value:missing,icon:ShieldCheck,filter:"missing" as const,accent:"border-t-4 border-t-violet-500",iconTone:"bg-violet-100 text-violet-700",valueTone:"text-violet-950"}].map(item=><button type="button" key={item.label} onClick={()=>selectFilter(item.filter)} aria-pressed={activeFilter===item.filter} className={`w-full rounded-2xl border text-left ${item.accent} bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C9C3] ${activeFilter===item.filter?"ring-2 ring-slate-400":""}`}><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-[#71889A]">{item.label}</p><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.iconTone}`}><item.icon className="h-5 w-5"/></span></div><p className={`mt-3 text-3xl font-semibold ${item.valueTone}`}>{item.value}</p><p className="mt-2 text-xs text-[#71889A]">Tap to view records →</p></button>)}</div>
    {preview&&<section className="mt-6 rounded-2xl border border-[#DCE7EF] bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold text-[#17384F]">Import review</h2><p className="mt-1 text-sm text-[#71889A]">The importer first matches the source DRIVERID to the driver directory ID, then falls back to first given name and surname while ignoring middle names. Agreed aliases are applied, and former employees are excluded. Existing non-empty fields are retained.</p></div><Badge variant="outline">{readyToImport} ready to import</Badge></div><div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="text-sm"><strong>Unmatched: {preview.unmatched.length}</strong></div><div className="text-sm"><strong>Ambiguous: {preview.ambiguous.length}</strong></div><p className="text-sm">Invalid dates: <strong>{preview.invalid}</strong></p></div>{needsManualMatch.length>0&&<div className="mt-5 rounded-xl border border-[#DCE7EF] p-4"><h3 className="font-semibold text-[#17384F]">Resolve driver matches</h3><p className="mt-1 text-sm text-[#71889A]">Choose the correct existing driver for each unmatched or ambiguous spreadsheet row. The selected app driver ID will be retained.</p><div className="mt-3 space-y-3">{needsManualMatch.map((row:any)=><div key={row.driverName} className="grid gap-2 sm:grid-cols-2 sm:items-center"><span className="text-sm font-medium">{row.driverName}</span><select className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={manualMatches[row.driverName]||""} onChange={e=>setManualMatches(current=>({...current,[row.driverName]:e.target.value}))}><option value="">Select matching driver…</option>{drivers.map((driver:any)=><option key={driver._docId} value={driver._docId}>{driver.name}</option>)}</select></div>)}</div></div>}<div className="mt-4 flex gap-2"><Button disabled={importing||!readyToImport} onClick={()=>void saveImport()}>{importing?"Importing…":"Confirm import"}</Button><Button variant="outline" onClick={()=>{setPreview(null);setManualMatches({});}}>Cancel</Button></div></section>}
    {selected&&form&&<section className="mt-6 rounded-2xl border border-[#D7E7EF] bg-[#F3F7FA] p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold text-[#17384F]">{selected.name}</h2><p className="mt-1 text-sm text-[#71889A]">Update the driver's compliance record. Dates are stored as ISO dates and displayed in UK format.</p></div><Button variant="ghost" size="icon" onClick={closeEditor}><X className="h-4 w-4"/></Button></div><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[{key:"licenceNumber",label:"Driving licence number",type:"text"},{key:"licenceValidFrom",label:"Licence valid from",type:"date"},{key:"licenceValidTo",label:"Driving licence expiry",type:"date"},{key:"consentExpiry",label:"DVLA consent expiry",type:"date"},{key:"cpcExpiry",label:"Driver CPC expiry",type:"date"},{key:"tachoCardExpiry",label:"Tachograph card expiry",type:"date"},{key:"dbsDate",label:"DBS check date",type:"date"},{key:"trainingExpiry",label:"Training review / expiry",type:"date"}].map(field=><div key={field.key}><Label>{field.label}</Label><Input className="mt-1.5 bg-white" type={field.type} value={(form as any)[field.key]||""} onChange={e=>setForm({...form,[field.key]:e.target.value})}/></div>)}</div><div className="mt-5 rounded-xl border border-[#DCE7EF] bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold text-[#17384F]">Section 88, DVLA licence renewal</h3><p className="mt-1 max-w-3xl text-xs text-[#71879A]">Record the date sent and the date DVLA received the completed application, plus supporting evidence. Proof of posting alone does not establish that DVLA received a complete application or that every Section 88 condition is met.</p></div>{isSection88Active(form as ComplianceRecord)&&<Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Covered under Section 88</Badge>}</div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><div><Label>Application sent to DVLA</Label><Input className="mt-1" type="date" value={form.section88ApplicationSentDate||""} onChange={e=>setForm({...form,section88ApplicationSentDate:e.target.value})}/></div><div><Label>DVLA received application</Label><Input className="mt-1" type="date" value={form.section88DvlaReceivedDate||""} onChange={e=>setForm({...form,section88DvlaReceivedDate:e.target.value})}/></div><div><Label>Evidence type</Label><select className="mt-1 h-10 w-full rounded-md border border-input bg-white px-3 text-sm" value={form.section88EvidenceType||"recorded-delivery"} onChange={e=>setForm({...form,section88EvidenceType:e.target.value})}><option value="recorded-delivery">Recorded / Special Delivery proof</option><option value="dvla-acknowledgement">DVLA acknowledgement</option><option value="online-confirmation">Online application confirmation</option><option value="other">Other evidence</option></select></div><div><Label>Tracking / evidence reference</Label><div className="mt-1 flex gap-2"><Input className="min-w-0 flex-1" value={form.section88TrackingReference||""} onChange={e=>setForm({...form,section88TrackingReference:e.target.value})} placeholder="Tracking number or reference"/><a href={form.section88TrackingReference?.trim()?`https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(form.section88TrackingReference.trim().replace(/\s+/g,"").toUpperCase())}`:"https://www.royalmail.com/track-your-item"} target="_blank" rel="noopener noreferrer" title="Open Royal Mail tracking results with this reference" aria-label="Track item on Royal Mail with the entered reference" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-[#D7E7EF] bg-white px-3 text-sm font-medium text-[#17384F] shadow-sm transition-colors hover:bg-[#EEF5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#35C9C3]"><ExternalLink className="h-4 w-4"/>Track item</a></div></div></div><div className="mt-4 flex flex-col gap-3"><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!form.section88EvidenceReceived} onChange={e=>setForm({...form,section88EvidenceReceived:e.target.checked,section88Confirmed:e.target.checked?form.section88Confirmed:false})}/><span><strong>Evidence received and checked</strong><span className="block text-xs text-[#71879A]">Keep the original proof or DVLA acknowledgement with the driver's compliance records.</span></span></label><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!form.section88Confirmed} disabled={!form.section88EvidenceReceived||!form.section88ApplicationSentDate||!form.section88DvlaReceivedDate} onChange={e=>setForm({...form,section88Confirmed:e.target.checked,section88Ended:false,section88EndReason:""})}/><span><strong>Section 88 criteria checked and confirmed</strong><span className="block text-xs text-[#71879A]">When confirmed, the licence-expiry warning is replaced by a Section 88 status for up to 12 months from the date DVLA received the completed application.</span></span></label><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={!!form.section88Ended} onChange={e=>setForm({...form,section88Ended:e.target.checked,section88Confirmed:e.target.checked?false:form.section88Confirmed})}/><span><strong>Section 88 cover has ended</strong><span className="block text-xs text-[#71879A]">Select when the new licence is issued, the application is withdrawn/refused, or another ending condition applies.</span></span></label></div>{form.section88Ended&&<div className="mt-3"><Label>Reason Section 88 ended</Label><Input className="mt-1" value={form.section88EndReason||""} onChange={e=>setForm({...form,section88EndReason:e.target.value})} placeholder="e.g. New licence issued, application refused"/></div>}{form.section88Confirmed&&<p className="mt-3 text-xs text-emerald-800">Confirmed by {form.section88CheckedBy||profile.displayName||"current user"}{form.section88CheckedAt?(" on "+new Date(form.section88CheckedAt).toLocaleDateString("en-GB")):" when saved"}. Check the driver's eligibility remains valid.</p>}</div><div className="mt-5 rounded-xl border border-[#DCE7EF] bg-white p-4"><div className="flex items-center justify-between"><div><h3 className="font-semibold text-[#17384F]">Licence endorsements</h3><p className="mt-1 text-xs text-[#71879A]">Record confirmed endorsements only. Points total is calculated from the entries below.</p></div><Badge variant={totalPoints>=9?"destructive":"outline"}>{totalPoints} points recorded</Badge></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div><Label>Offence code</Label><Input className="mt-1" value={endorsement.offenceCode} onChange={e=>setEndorsement({...endorsement,offenceCode:e.target.value})} placeholder="e.g. SP30"/></div><div><Label>Points</Label><Input className="mt-1" type="number" min="1" max="11" value={endorsement.points} onChange={e=>setEndorsement({...endorsement,points:Number(e.target.value)})}/></div><div><Label>Offence date</Label><Input className="mt-1" type="date" value={endorsement.offenceDate} onChange={e=>setEndorsement({...endorsement,offenceDate:e.target.value})}/></div><div><Label>Expiry date (if known)</Label><Input className="mt-1" type="date" value={endorsement.expiryDate||""} onChange={e=>setEndorsement({...endorsement,expiryDate:e.target.value})}/></div></div><Button className="mt-3" variant="outline" size="sm" onClick={addEndorsement}>Add endorsement</Button>{(form.endorsements||[]).length>0&&<div className="mt-3 divide-y">{form.endorsements!.map((item,index)=><div key={index} className="flex items-center justify-between py-2 text-sm"><span><strong>{item.offenceCode}</strong>, {item.points} points, offence {dateLabel(item.offenceDate)}, expiry {dateLabel(item.expiryDate)}</span><Button size="sm" variant="ghost" onClick={()=>setForm({...form,endorsements:form.endorsements!.filter((_,i)=>i!==index)})}>Remove</Button></div>)}</div>}</div><div className="mt-4"><Label>Compliance notes</Label><textarea className="mt-1.5 min-h-20 w-full rounded-md border border-input bg-white px-3 py-2 text-sm" value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Record factual notes, source and follow-up required."/></div><div className="mt-5 flex flex-wrap gap-2"><Button disabled={saving} onClick={()=>void saveRecord()}><Save className="mr-2 h-4 w-4"/>{saving?"Saving…":"Save compliance record"}</Button>{selected.active!==false&&["lead","manager"].includes(profile.memberRole)&&<Button type="button" variant="destructive" onClick={()=>void markDriverInactive()}><UserX className="mr-2 h-4 w-4"/>Mark as inactive</Button>}<Button variant="outline" onClick={closeEditor}>Cancel</Button></div></section>}
    <section ref={registerRef} className="mt-6 scroll-mt-5 rounded-2xl border border-[#DCE7EF] bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-[#17384F]">Driver compliance register</h2><p className="mt-1 text-xs text-[#71879A]">Records link to the existing driver directory. Select a driver to maintain their compliance details.</p><div className="mt-2 flex items-center gap-2 text-xs"><Badge variant="outline">{activeFilter==="all"?"All active drivers":activeFilter==="due"?"Due within 90 days":activeFilter==="expired"?"Expired compliance dates":"Missing licence records"}</Badge><button type="button" className="font-medium text-sky-700 underline" onClick={()=>selectFilter("all")}>Clear filter</button></div></div><div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input className="pl-9" placeholder="Search drivers…" value={search} onChange={e=>setSearch(e.target.value)}/></div></div><div className="mt-4 overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b border-[#DCE7EF] bg-[#EEF5F9] text-xs uppercase tracking-wide text-[#526C80]"><th className="py-3 pr-4">Driver</th><th className="py-3 pr-4">Licence expiry</th><th className="py-3 pr-4">CPC</th><th className="py-3 pr-4">Tacho card</th><th className="py-3 pr-4">Warning / expiry reason</th><th className="py-3 pr-4">Points</th><th className="py-3 pr-4">Status</th><th className="py-3 pr-4"></th></tr></thead><tbody>{filteredRows.map(({driver,record,duplicate})=>{const section88Active=isSection88Active(record);const status=section88Active?{label:"Covered under Section 88",tone:"secondary"}:statusFor(record?.licenceValidTo);const alerts=complianceAlerts(record);const visibleAlerts=activeFilter==="due"?alerts.filter(alert=>!alert.expired):activeFilter==="expired"?alerts.filter(alert=>alert.expired):alerts;const points=(record?.endorsements||[]).reduce((sum,item)=>sum+Number(item.points||0),0);return <tr key={driver._docId} role="button" tabIndex={0} aria-label={`Open compliance record for ${driver.name}`} onClick={()=>openEditor(driver,record)} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();openEditor(driver,record);}}} className="border-b border-[#E8EFF4] cursor-pointer hover:bg-[#F3F7FA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500"><td className="py-3 pr-4 font-medium text-[#17384F]"><div>{driver.name}{duplicate&&<span className="ml-2 text-xs text-red-600">Duplicate record, review</span>}</div>{visibleAlerts.length>0&&<div className="mt-1 space-y-1 font-normal">{visibleAlerts.map(alert=><div key={alert.key} className="text-xs text-rose-700">{alert.label}: {alert.expired?"Expired":`${alert.days} days remaining`} ({dateLabel(alert.date)})</div>)}</div>}</td><td className="py-3 pr-4">{dateLabel(record?.licenceValidTo)}</td><td className="py-3 pr-4">{dateLabel(record?.cpcExpiry)}</td><td className="py-3 pr-4">{dateLabel(record?.tachoCardExpiry)}</td><td className="py-3 pr-4">{visibleAlerts.length? <div className="space-y-1">{visibleAlerts.map(alert=><div key={alert.key} className="whitespace-nowrap"><Badge variant={alert.expired||alert.days<=30?"destructive":"outline"}>{alert.expired?"Expired":`${alert.days} days`}</Badge><span className="ml-2 text-xs">{alert.label}, {dateLabel(alert.date)}</span></div>)}</div> :activeFilter==="missing"?"Licence record missing":section88Active?<Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Covered under Section 88</Badge>:"No warning"}</td><td className="py-3 pr-4"><Badge variant={points>=9?"destructive":"outline"}>{points} pts</Badge></td><td className="py-3 pr-4"><Badge variant={status.tone as any}>{status.label}</Badge></td><td className="py-3 pr-4"><Button size="sm" variant="outline" onClick={e=>{e.stopPropagation();openEditor(driver,record);}}><Pencil className="mr-1 h-3 w-3"/>Manage</Button></td></tr>})}</tbody></table></div>{!filteredRows.length&&<div className="py-10 text-center text-sm text-muted-foreground">No drivers match this filter or search.</div>}</section>
    <p className="mt-4 flex items-start gap-2 text-xs text-[#71879A]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>Importing updates the compliance register only. It does not alter the driver directory or original spreadsheet. CPC fields are imported when present in the same CSV. Former employees Joanne Marshall, Krzysztof Rojek and Steven Woodward are excluded. Automated DVLA checks and email alerts are not connected yet.</p>
  </div>;
}