import { useAuth } from "@/_core/hooks/useAuth";
import { ColleagueMarker } from "@/components/ColleagueMarker";
import { HelpRequestDialog } from "@/components/HelpRequestDialog";
import { LoadError, TinyButton } from "@/components/WorkspacePrimitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { priorityStyle } from "@/lib/operations";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, HandHeart, Loader2, UserCheck, ClipboardList } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const filters = [
  { value: "open", label: "Open" },
  { value: "acknowledged", label: "In progress" },
  { value: "resolved", label: "Closed" },
  { value: "all", label: "All" },
];

export default function HelpRequests() {
  const { user } = useAuth();
  const [status, setStatus] = useState("open");
  const [closing, setClosing] = useState<any>(null);
  const [resolution, setResolution] = useState("");
  const requests = trpc.operations.helpRequests.list.useQuery({ status: status === "all" ? undefined : status });
  const acknowledge = trpc.operations.helpRequests.acknowledge.useMutation({ onSuccess: () => { void requests.refetch(); toast.success("Support request acknowledged and owned."); }, onError: (error: Error) => toast.error(error.message) });
  const resolve = trpc.operations.helpRequests.resolve.useMutation({ onSuccess: () => { setClosing(null); setResolution(""); void requests.refetch(); toast.success("Support request closed."); }, onError: (error: Error) => toast.error(error.message) });
  const canAct = Boolean(user?.canUseOnCall);

  if (requests.isLoading) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[#087E8B]" /></div>;
  if (requests.isError) return <LoadError message="Support requests could not be loaded. No record has been changed." onRetry={() => void requests.refetch()} />;

  return <main className="mx-auto max-w-6xl space-y-6 pb-12">
    <section className="relative overflow-hidden rounded-2xl bg-[#102B46] px-5 py-7 text-white shadow-sm sm:px-8 sm:py-9">
      <div className="pointer-events-none absolute -right-12 -top-20 h-64 w-64 rounded-full border-[34px] border-white/5" />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#8ED9D6]"><HandHeart className="h-4 w-4" /> Team support</div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Help & cover</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-200 sm:text-base">Raise a request, pick it up and keep everyone informed until it is sorted.</p>
        </div>
        <HelpRequestDialog disabled={!canAct}><Button disabled={!canAct} className="h-11 w-full bg-[#18A3A5] px-5 font-semibold text-white shadow-sm hover:bg-[#138C91] sm:w-auto"><HandHeart className="mr-2 h-4 w-4" />New request</Button></HelpRequestDialog>
      </div>
    </section>

    <section className="overflow-hidden rounded-2xl border border-[#DCE5EB] bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-[#E7EDF1] px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F4F5] text-[#087E8B]"><ClipboardList className="h-5 w-5" /></div>
          <div><h2 className="text-lg font-bold text-[#17324B]">Requests</h2><p className="text-sm text-[#71808C]">Track who has asked, who owns it and what happens next.</p></div>
        </div>
        <div className="flex w-full gap-1 rounded-xl bg-[#F0F4F7] p-1 sm:w-auto">
          {filters.map(filter => <button key={filter.value} type="button" onClick={() => setStatus(filter.value)} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-colors sm:flex-none ${status === filter.value ? "bg-white text-[#087E8B] shadow-sm" : "text-[#657583] hover:text-[#17324B]"}`}>{filter.label}</button>)}
        </div>
      </div>

      <div className="divide-y divide-[#E8EEF2]">
        {requests.data?.length ? requests.data.map((request: any) => <article key={request.id} className="px-4 py-5 transition-colors hover:bg-[#FAFCFD] sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`border-0 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${priorityStyle[request.priority]}`}>{request.priority}</Badge>
                <span className="rounded-full bg-[#E6F4F4] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#087E8B]">{request.requestType === "cover" ? "Cover" : "Help"}</span>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${request.status === "resolved" ? "bg-[#E9F5EF] text-[#28734D]" : request.status === "acknowledged" ? "bg-[#FFF4DF] text-[#946313]" : "bg-[#EDF2F6] text-[#526779]"}`}>{request.status === "acknowledged" ? "In progress" : request.status}</span>
              </div>
              <h3 className="mt-3 text-base font-bold text-[#17324B] sm:text-lg">{request.title}</h3>
              <p className="mt-1.5 max-w-3xl whitespace-pre-wrap text-sm leading-6 text-[#586B7A]">{request.detail}</p>
              {request.requestType === "cover" ? <div className="mt-3 inline-flex flex-wrap items-center gap-2 rounded-lg bg-[#F1F6FA] px-3 py-2 text-xs font-semibold text-[#315B72]"><span className="text-[#7A8D9B]">Cover needed</span>{request.workDate || "Date not recorded"}{request.requestedDuty ? <span>· {String(request.requestedDuty).replace("_", " ")}</span> : null}</div> : null}
              {request.resolution ? <div className="mt-4 rounded-xl border border-[#D4E9DF] bg-[#F0F8F4] px-4 py-3 text-sm text-[#276B4D]"><strong>Outcome:</strong> {request.resolution}</div> : null}
            </div>
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-[#F5F8FA] p-3 sm:min-w-[270px] lg:w-[290px] lg:grid-cols-1">
              <div><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#82909B]">Requested by</p><ColleagueMarker member={request.requester || { displayName: request.requestedByName }} showRole /></div>
              <div><p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#82909B]">Request owner</p><ColleagueMarker member={request.owner} showRole /></div>
            </div>
          </div>
          {canAct && request.status !== "resolved" ? <div className="mt-4 flex flex-wrap gap-2 border-t border-[#EDF1F4] pt-4">{request.status === "open" ? <TinyButton disabled={acknowledge.isPending} onClick={() => acknowledge.mutate({ id: request.id })}><UserCheck className="mr-1.5 h-3.5 w-3.5" />Take ownership</TinyButton> : null}<TinyButton disabled={resolve.isPending} onClick={() => { setClosing(request); setResolution(""); }}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Close request</TinyButton></div> : null}
        </article>) : <div className="flex flex-col items-center px-6 py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#EAF4F5] text-[#087E8B]"><ClipboardList className="h-7 w-7" /></div>
          <h3 className="text-base font-bold text-[#17324B]">Nothing to show here</h3>
          <p className="mt-2 max-w-sm text-sm leading-6 text-[#71808C]">{status === "open" ? "There are no open requests. New requests will appear here when someone needs help or cover." : "There are no requests in this filter."}</p>
          {canAct ? <div className="mt-5"><HelpRequestDialog><Button className="bg-[#087E8B] hover:bg-[#066874]"><HandHeart className="mr-2 h-4 w-4" />Create a request</Button></HelpRequestDialog></div> : null}
        </div>}
      </div>
    </section>

    <Dialog open={Boolean(closing)} onOpenChange={open => { if (!open) setClosing(null); }}>
      <DialogContent className="max-w-md"><DialogHeader><DialogTitle>Close support request</DialogTitle><DialogDescription>Record the outcome so the requester and team know what happened.</DialogDescription></DialogHeader>
        <div className="space-y-2 py-2"><Label>Outcome <span className="font-normal text-[#7A8780]">(optional)</span></Label><Textarea value={resolution} onChange={event => setResolution(event.target.value)} placeholder="For example, late cover confirmed with Coral." /></div>
        <DialogFooter><Button onClick={() => resolve.mutate({ id: closing?.id, resolution })} disabled={resolve.isPending} className="bg-[#087E8B] hover:bg-[#066874]">Close request</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </main>;
}
