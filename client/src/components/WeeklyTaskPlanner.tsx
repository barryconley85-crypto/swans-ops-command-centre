import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { localDateKey } from "@/lib/operations";
import { addDays, format } from "date-fns";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type PlannerTask = {
  workDate: string;
  templateItemId?: number | string | null;
  title: string;
  detail?: string | null;
  priority: "low" | "normal" | "high" | "critical";
  dueAt?: number | null;
  assignedTeamMemberId: number;
};

type WeeklyTaskPlannerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: any[];
  members: any[];
  initialTemplateId?: string;
  weekStart: string;
  pending: boolean;
  onSubmit: (tasks: PlannerTask[]) => void;
};

export function WeeklyTaskPlanner({ open, onOpenChange, templates, members, initialTemplateId, weekStart, pending, onSubmit }: WeeklyTaskPlannerProps) {
  const [templateId, setTemplateId] = useState("");
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [plannerWeekStart, setPlannerWeekStart] = useState(weekStart);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(new Date(`${plannerWeekStart}T12:00:00`), index)), [plannerWeekStart]);
  const template = templates.find(item => String(item.id) === templateId) ?? templates[0];
  const items = template?.items ?? [];

  useEffect(() => {
    if (!open) return;
    if (initialTemplateId && templates.some(item => String(item.id) === initialTemplateId)) setTemplateId(initialTemplateId);
    else if (templates.length && !templates.some(item => String(item.id) === templateId)) setTemplateId(String(templates[0].id));
    setPlannerWeekStart(weekStart);
  }, [open, initialTemplateId, templateId, templates, weekStart]);

  useEffect(() => setOwners({}), [template?.id, plannerWeekStart, open]);

  const moveWeek = (offset: number) => { const date = addDays(new Date(`${plannerWeekStart}T12:00:00`), offset * 7); setPlannerWeekStart(localDateKey(date)); };

  const scheduledCount = Object.values(owners).filter(Boolean).length;
  const setOwner = (itemKey: string, date: Date, memberId: string) => setOwners(current => ({ ...current, [`${itemKey}:${localDateKey(date)}`]: memberId }));
  const submit = () => {
    if (!template || !scheduledCount) return toast.error("Schedule at least one task and choose its owner.");
    const tasks: PlannerTask[] = [];
    items.forEach((item: any, itemIndex: number) => {
      const itemKey = String(item.id ?? itemIndex);
      days.forEach(day => {
        const assignedTeamMemberId = Number(owners[`${itemKey}:${localDateKey(day)}`]);
        if (!assignedTeamMemberId) return;
        tasks.push({
          workDate: localDateKey(day),
          templateItemId: typeof item.id === "number" ? item.id : `${template.id}:${itemIndex}`,
          title: item.title,
          detail: item.detail ?? null,
          priority: item.priority ?? "normal",
          dueAt: item.dueTime ? new Date(`${localDateKey(day)}T${item.dueTime}:00`).getTime() : null,
          assignedTeamMemberId,
        });
      });
    });
    onSubmit(tasks);
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-6xl border-0 bg-[#FCFCFA] p-0 shadow-2xl">
      <DialogHeader className="border-b border-[#E5E9E6] px-6 pb-5 pt-6">
        <div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E6F0ED] text-[#317168]"><CalendarRange className="h-5 w-5" /></span><div><DialogTitle>Plan a week of tasks</DialogTitle><DialogDescription className="mt-2">Choose a reusable checklist, then assign each task to a named person on the days it is needed. Empty cells are not scheduled.</DialogDescription></div></div>
      </DialogHeader>
      <div className="space-y-4 px-6 py-5">
        <div className="max-w-md space-y-2"><Label>Checklist</Label><select value={template ? String(template.id) : ""} onChange={event => { setTemplateId(event.target.value); setOwners({}); }} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Choose a checklist…</option>{templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        {template ? <>
          <div className="flex flex-col gap-3 rounded-xl border border-[#DCE8E0] bg-[#F5FAF7] px-4 py-3 text-xs leading-5 text-[#4E6B5D] sm:flex-row sm:items-center sm:justify-between"><p><strong>{template.name}</strong> · Week commencing {format(days[0]!, "d MMMM")} · {scheduledCount} task{scheduledCount === 1 ? "" : "s"} currently scheduled. Every selected cell must have an owner.</p><div className="flex items-center gap-1"><Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveWeek(-1)} aria-label="Previous week"><ChevronLeft className="h-4 w-4" /></Button><Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveWeek(1)} aria-label="Next week"><ChevronRight className="h-4 w-4" /></Button></div></div>
          <div className="overflow-x-auto rounded-xl border border-[#E2E8E4]">
            <div className="min-w-[1040px]">
              <div className="grid grid-cols-[250px_repeat(7,minmax(112px,1fr))] border-b border-[#E6ECE8] bg-[#F8FAF8]"><div className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7A8780]">Task from checklist</div>{days.map(day => <div key={day.toISOString()} className="border-l border-[#E6ECE8] px-3 py-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7A8780]">{format(day, "EEE")}</p><p className="mt-1 text-sm font-semibold text-[#2C3934]">{format(day, "d MMM")}</p></div>)}</div>
              {items.map((item: any, itemIndex: number) => { const itemKey = String(item.id ?? itemIndex); return <div key={itemKey} className="grid grid-cols-[250px_repeat(7,minmax(112px,1fr))] border-b border-[#EEF2EF] last:border-0"><div className="px-4 py-3"><p className="text-sm font-semibold text-[#2E3D35]">{item.title}</p>{item.detail ? <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#78857E]">{item.detail}</p> : null}</div>{days.map(day => <div key={day.toISOString()} className="border-l border-[#EEF2EF] p-2"><select aria-label={`${item.title} on ${format(day, "EEEE d MMMM")}`} value={owners[`${itemKey}:${localDateKey(day)}`] ?? ""} onChange={event => setOwner(itemKey, day, event.target.value)} className="h-9 w-full rounded-md border border-[#DCE5DF] bg-white px-2 text-[11px] text-[#405249]"><option value="">Not scheduled</option>{members.map(member => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></div>)}</div>; })}
            </div>
          </div>
        </> : <p className="rounded-xl bg-[#F4F7F5] px-4 py-6 text-center text-sm text-[#68766F]">Create a checklist first, then return here to plan its daily ownership.</p>}
      </div>
      <DialogFooter className="border-t border-[#E5E9E6] px-6 py-4"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!template || !scheduledCount || pending} onClick={submit} className="bg-[#1D5C63] hover:bg-[#164B50]">{pending ? "Saving plan…" : `Save ${scheduledCount || "weekly"} task${scheduledCount === 1 ? "" : "s"}`}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

export type { PlannerTask };
