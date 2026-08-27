import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { localDateKey } from "@/lib/operations";
import { trpc } from "@/lib/trpc";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

const defaultForm = () => ({ requestType: "help", priority: "normal", title: "", detail: "", workDate: localDateKey(), requestedDuty: "" });

export function HelpRequestDialog({ children, disabled = false }: { children: ReactNode; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const create = trpc.operations.helpRequests.create.useMutation({
    onSuccess: () => {
      setOpen(false);
      setForm(defaultForm());
      toast.success("Your request is visible to the operations team.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const submit = () => create.mutate({ ...form, workDate: form.requestType === "cover" ? form.workDate : null, requestedDuty: form.requestType === "cover" ? form.requestedDuty || null : null });

  return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild>{children}</DialogTrigger><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>Ask for help or request cover</DialogTitle><DialogDescription>Keep it short: someone should understand the need and take ownership without a long back-and-forth.</DialogDescription></DialogHeader><div className="space-y-4 py-2"><div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label>Request type</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.requestType} onChange={event => setForm({ ...form, requestType: event.target.value })} disabled={disabled}><option value="help">Need help</option><option value="cover">Need cover</option></select></div><div className="space-y-1.5"><Label>Urgency</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })} disabled={disabled}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div></div>{form.requestType === "cover" ? <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><Label>Date needed</Label><Input type="date" value={form.workDate} onChange={event => setForm({ ...form, workDate: event.target.value })} /></div><div className="space-y-1.5"><Label>Duty</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.requestedDuty} onChange={event => setForm({ ...form, requestedDuty: event.target.value })}><option value="">Any duty</option><option value="early">Early</option><option value="core">Core</option><option value="late">Late</option><option value="on_call">On-call</option></select></div></div> : null}<div className="space-y-1.5"><Label>Short headline</Label><Input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} placeholder="For example, need a second check on a late change" /></div><div className="space-y-1.5"><Label>What would help?</Label><Textarea className="min-h-28" value={form.detail} onChange={event => setForm({ ...form, detail: event.target.value })} placeholder="Give the important context and the support you need. Avoid customer personal or payment information." /></div></div><DialogFooter><Button disabled={disabled || create.isPending || !form.title.trim() || !form.detail.trim()} onClick={submit} className="bg-[#1D5C63] hover:bg-[#164B50]">{create.isPending ? "Sending…" : "Send request"}</Button></DialogFooter></DialogContent></Dialog>;
}
