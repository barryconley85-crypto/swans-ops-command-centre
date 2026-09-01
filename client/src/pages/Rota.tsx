import { useAuth } from "@/_core/hooks/useAuth";
import { EmptyState, LoadError, PageHeader, Panel, PanelHeading, TinyButton } from "@/components/WorkspacePrimitives";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ColleagueMarker } from "@/components/ColleagueMarker";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { hasExactRotaDuplicate, standardShiftPatterns } from "@/lib/collaboration";
import { isoWeekStart, localDateKey } from "@/lib/operations";
import { addDays, format } from "date-fns";
import { CalendarClock, ChevronLeft, ChevronRight, CircleAlert, Pencil, Plus, RotateCcw, Trash2, UserRoundCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const assignmentStyle: Record<string, string> = {
  early: "border-[#B8D5C8] bg-[#E8F3EE] text-[#276D57]",
  core: "border-[#BCD8DF] bg-[#E9F4F6] text-[#327183]",
  late: "border-[#DED0B6] bg-[#FFF5E7] text-[#9A641D]",
  on_call: "border-[#C7C5DF] bg-[#F0EFFA] text-[#625996]",
  leave: "border-[#D8D8D8] bg-[#F3F4F3] text-[#626A66]",
  unavailable: "border-[#F1C9C3] bg-[#FFF0EE] text-[#B44C40]",
  holiday: "border-[#D6C8E9] bg-[#F6F0FB] text-[#79589C]",
};

export default function Rota() {
  const { user } = useAuth();
  const isManager = user?.canManageOperations;
  const [weekStart, setWeekStart] = useState(isoWeekStart());
  const [open, setOpen] = useState(false);
  const [editingAssignmentId, setEditingAssignmentId] = useState<number | null>(null);
  const [assignmentPendingRemoval, setAssignmentPendingRemoval] = useState<any>(null);
  const [form, setForm] = useState({ workDate: weekStart, teamMemberId: "", assignmentType: "core", startTime: "09:00", endTime: "17:00", note: "" });
  // Dates ticked on for a NEW assignment. Ignored while editing an existing one (edit stays single-day).
  const [selectedDates, setSelectedDates] = useState<string[]>([weekStart]);
  const team = trpc.operations.team.list.useQuery();
  const rota = trpc.operations.rota.week.useQuery({ weekStart });
  const utils = trpc.useUtils();
  const resetForm = (date = weekStart) => { setEditingAssignmentId(null); setForm({ workDate: date, teamMemberId: "", assignmentType: "core", startTime: "09:00", endTime: "17:00", note: "" }); setSelectedDates([date]); };
  // A single mutation carries every selected date, so a multi-day duty is submitted in one action.
  const create = trpc.operations.rota.create.useMutation();
  const update = trpc.operations.rota.update.useMutation({ onSuccess: async () => { await rota.refetch(); setOpen(false); resetForm(); toast.success("Rota assignment updated."); }, onError: error => toast.error(error.message) });
  const remove = trpc.operations.rota.remove.useMutation({ onSuccess: async () => { await rota.refetch(); toast.success("Rota assignment removed."); }, onError: error => toast.error(error.message) });
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(new Date(`${weekStart}T12:00:00`), index)), [weekStart]);
  const activeMembers = team.data?.filter(member => member.status !== "inactive") ?? [];
  const assignmentFor = (memberId: number, date: Date) => rota.data?.assignments.filter(item => item.teamMemberId === memberId && item.workDate === localDateKey(date)) ?? [];
  const onCallGaps = days.filter(day => !(rota.data?.assignments.some(item => item.workDate === localDateKey(day) && item.assignmentType === "on_call")));
  const shiftGaps = days.filter(day => !(rota.data?.assignments.some(item => item.workDate === localDateKey(day) && ["early", "core", "late"].includes(item.assignmentType))));
  const counts = activeMembers.map(member => ({ member, onCall: rota.data?.assignments.filter(item => item.teamMemberId === member.id && item.assignmentType === "on_call").length ?? 0, shifts: rota.data?.assignments.filter(item => item.teamMemberId === member.id && ["early", "core", "late"].includes(item.assignmentType)).length ?? 0 }));
  const moveWeek = (offset: number) => { const changed = addDays(new Date(`${weekStart}T12:00:00`), offset * 7); const key = localDateKey(changed); setWeekStart(key); if (!editingAssignmentId) { setForm(current => ({ ...current, workDate: key })); setSelectedDates([key]); } };

  const toggleDate = (dateKey: string) => {
    setSelectedDates(current => current.includes(dateKey) ? current.filter(d => d !== dateKey) : [...current, dateKey].sort());
  };
  const selectWeekdays = () => setSelectedDates(days.filter(d => { const dow = d.getDay(); return dow !== 0 && dow !== 6; }).map(d => localDateKey(d)));
  const selectAllDays = () => setSelectedDates(days.map(d => localDateKey(d)));
  const selectJustOne = () => setSelectedDates([form.workDate]);

  const submit = async () => {
    if (!form.teamMemberId) return toast.error("Choose the team member who owns this shift.");
    const isTimedShift = !["leave", "unavailable", "on_call", "holiday"].includes(form.assignmentType);
    const basePayload = {
      teamMemberId: Number(form.teamMemberId),
      assignmentType: form.assignmentType as "early" | "core" | "late" | "on_call" | "leave" | "unavailable" | "holiday",
      startTime: isTimedShift ? form.startTime : undefined,
      endTime: isTimedShift ? form.endTime : undefined,
      note: form.note || undefined,
    };

    if (editingAssignmentId) {
      const payload = { workDate: form.workDate, ...basePayload };
      if (hasExactRotaDuplicate(rota.data?.assignments ?? [], payload, editingAssignmentId)) return toast.error("That exact duty is already on this person’s rota. Edit the existing duty or choose different times.");
      update.mutate({ id: editingAssignmentId, ...payload });
      return;
    }

    const targetDates = Array.from(new Set(selectedDates.length ? selectedDates : [form.workDate]));
    const duplicateDates = targetDates.filter(workDate => hasExactRotaDuplicate(rota.data?.assignments ?? [], { workDate, ...basePayload }, null));
    const datesToCreate = targetDates.filter(workDate => !duplicateDates.includes(workDate));

    if (!datesToCreate.length) return toast.error(targetDates.length > 1 ? "That exact duty is already on this person’s rota for every selected day." : "That exact duty is already on this person’s rota. Edit the existing duty or choose different times.");

    try {
      await create.mutateAsync({ workDates: datesToCreate, ...basePayload });
      await rota.refetch();
  setOpen(false);
  resetForm();

  if (duplicateDates.length) {
    toast.success(
      `Saved ${datesToCreate.length} day${datesToCreate.length === 1 ? "" : "s"}. Skipped ${duplicateDates.length} day${duplicateDates.length === 1 ? "" : "s"} with an existing exact duty.`
    );
  } else {
    toast.success(
      datesToCreate.length > 1
        ? `Rota assignment saved for ${datesToCreate.length} days.`
        : "Rota assignment saved."
    );
  }
    } catch (error: any) {
      await rota.refetch();
      toast.error(
        error?.message ||
          "The rota assignment could not be saved. Check the rota and try again."
      );
    }
  };

  const usePattern = (pattern: typeof standardShiftPatterns[number]) => { setEditingAssignmentId(null); setForm(current => ({ ...current, assignmentType: pattern.assignmentType, startTime: pattern.startTime, endTime: pattern.endTime })); setOpen(true); };
  const editAssignment = (item: any) => { setEditingAssignmentId(item.id); setForm({ workDate: item.workDate, teamMemberId: String(item.teamMemberId), assignmentType: item.assignmentType, startTime: item.startTime || "09:00", endTime: item.endTime || "17:00", note: item.note || "" }); setSelectedDates([item.workDate]); setOpen(true); };
  if (team.isError || rota.isError) return <LoadError message="The weekly rota could not be loaded. Your existing cover plan is unchanged." onRetry={() => void Promise.all([team.refetch(), rota.refetch()])} />;

  return <div className="mx-auto max-w-[1500px] pb-10"><PageHeader eyebrow={`Week commencing ${format(days[0]!, "d MMMM")}`} title="Rota & on-call" description="Plan cover, holidays and availability explicitly so that cover gaps are visible before the operating day." actions={<><div className="flex h-10 items-center rounded-xl border border-[#DFE6E1] bg-white p-1 shadow-sm"><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveWeek(-1)}><ChevronLeft className="h-4 w-4" /></Button><span className="min-w-36 px-2 text-center text-sm font-semibold text-[#34413C]">{format(days[0]!, "d MMM")} – {format(days[6]!, "d MMM")}</span><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveWeek(1)}><ChevronRight className="h-4 w-4" /></Button></div>{isManager ? <Dialog open={open} onOpenChange={nextOpen => { setOpen(nextOpen); if (!nextOpen) resetForm(); }}><DialogTrigger asChild><Button onClick={() => resetForm()} className="bg-[#1D5C63] hover:bg-[#164B50]"><Plus className="mr-2 h-4 w-4" />Add cover</Button></DialogTrigger><DialogContent className="max-w-lg"><DialogHeader><DialogTitle>{editingAssignmentId ? "Edit rota assignment" : "Add rota assignment"}</DialogTitle><DialogDescription>{editingAssignmentId ? "Update the duty, holiday or availability record if the cover plan has changed." : "Use shift, on-call, holiday, leave or unavailable assignments so that cover gaps are evident. Tick more than one day to apply the same duty across the week."}</DialogDescription></DialogHeader><div className="space-y-4 py-2">

      {editingAssignmentId ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.workDate} onChange={event => setForm({ ...form, workDate: event.target.value })} /></div>
          <div className="space-y-2"><Label>Team member</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.teamMemberId} onChange={event => setForm({ ...form, teamMemberId: event.target.value })}><option value="">Choose…</option>{activeMembers.map(member => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label>Days</Label>
              <div className="flex gap-1.5">
                <TinyButton type="button" onClick={selectJustOne}>Just one day</TinyButton>
                <TinyButton type="button" onClick={selectWeekdays}>Weekdays</TinyButton>
                <TinyButton type="button" onClick={selectAllDays}>All 7</TinyButton>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {days.map(day => {
                const key = localDateKey(day);
                const isSelected = selectedDates.includes(key);
                return <button type="button" key={key} onClick={() => toggleDate(key)} className={`rounded-lg border px-1 py-2 text-center transition ${isSelected ? "border-[#1D5C63] bg-[#EAF3F1] text-[#164B50]" : "border-[#E1E7E3] bg-white text-[#5C6862] hover:border-[#B9D5C9]"}`}>
                  <p className="text-[10px] font-bold uppercase tracking-wide">{format(day, "EEE")}</p>
                  <p className="mt-0.5 text-xs font-semibold">{format(day, "d")}</p>
                </button>;
              })}
            </div>
            {selectedDates.length > 1 ? <p className="pt-0.5 text-[11px] text-[#6F7C76]">This duty will be added to {selectedDates.length} days.</p> : null}
          </div>
          <div className="space-y-2 sm:col-span-2"><Label>Team member</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.teamMemberId} onChange={event => setForm({ ...form, teamMemberId: event.target.value })}><option value="">Choose…</option>{activeMembers.map(member => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></div>
        </div>
      )}

      <div className="space-y-2"><Label>Assignment</Label><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.assignmentType} onChange={event => setForm({ ...form, assignmentType: event.target.value })}><option value="early">Early shift</option><option value="core">Core shift</option><option value="late">Late shift</option><option value="on_call">On-call lead</option><option value="holiday">Holiday</option><option value="leave">Leave</option><option value="unavailable">Unavailable</option></select></div>
      {!["leave", "unavailable", "on_call", "holiday"].includes(form.assignmentType) ? <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Start</Label><Input type="time" value={form.startTime} onChange={event => setForm({ ...form, startTime: event.target.value })} /></div><div className="space-y-2"><Label>End</Label><Input type="time" value={form.endTime} onChange={event => setForm({ ...form, endTime: event.target.value })} /></div></div> : null}
      <div className="space-y-2"><Label>Cover note</Label><Input value={form.note} onChange={event => setForm({ ...form, note: event.target.value })} placeholder="Optional context or location" /></div>
    </div><DialogFooter><Button disabled={create.isPending || update.isPending} onClick={submit} className="bg-[#1D5C63] hover:bg-[#164B50]">{editingAssignmentId ? "Save changes" : selectedDates.length > 1 ? `Save for ${selectedDates.length} days` : "Save assignment"}</Button></DialogFooter></DialogContent></Dialog> : null}</>} />
    <AlertDialog open={Boolean(assignmentPendingRemoval)} onOpenChange={nextOpen => { if (!nextOpen) setAssignmentPendingRemoval(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove this rota assignment?</AlertDialogTitle><AlertDialogDescription>{assignmentPendingRemoval ? `${assignmentPendingRemoval.assignmentType.replace("_", " ")} duty for ${assignmentPendingRemoval.workDate}${assignmentPendingRemoval.startTime ? `, ${assignmentPendingRemoval.startTime}–${assignmentPendingRemoval.endTime}` : ""}, will be removed. This cannot be undone.` : ""}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep assignment</AlertDialogCancel><AlertDialogAction disabled={remove.isPending} onClick={() => { if (assignmentPendingRemoval) remove.mutate({ id: assignmentPendingRemoval.id }); setAssignmentPendingRemoval(null); }} className="bg-[#A73D34] hover:bg-[#8F3028]">Remove assignment</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <section className="mb-5 grid gap-3 lg:grid-cols-3">{standardShiftPatterns.map(pattern => <button key={pattern.label} onClick={() => usePattern(pattern)} className="group rounded-2xl border border-[#DDE7E1] bg-white p-4 text-left shadow-[0_12px_28px_-26px_rgba(18,48,41,0.45)] transition hover:-translate-y-0.5 hover:border-[#B9D5C9]"><div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#668078]">{pattern.label} pattern</span><span className="rounded-full bg-[#EDF5F1] px-2 py-1 text-[10px] font-bold text-[#34715F]">Use pattern</span></div><p className="mt-4 text-xl font-semibold tracking-tight text-[#263730]">{pattern.startTime}–{pattern.endTime}</p><p className="mt-1 text-xs leading-5 text-[#728079]">{pattern.description}</p></button>)}</section>
    <section className="mb-6 grid gap-4 md:grid-cols-2"><GapCard icon={<CircleAlert className="h-5 w-5" />} label="On-call gaps" description={onCallGaps.length ? `${onCallGaps.map(day => format(day, "EEE d")).join(", ")} currently has no named on-call lead.` : "Every day this week has a named on-call lead."} alert={Boolean(onCallGaps.length)} /><GapCard icon={<CalendarClock className="h-5 w-5" />} label="Shift coverage" description={shiftGaps.length ? `${shiftGaps.map(day => format(day, "EEE d")).join(", ")} has no rostered operational shift.` : "Core operational cover is present every day this week."} alert={Boolean(shiftGaps.length)} /></section>
    <Panel className="overflow-x-auto">
      <div className="min-w-[910px]">
        <div className="grid grid-cols-[200px_repeat(7,minmax(100px,1fr))] border-b border-[#E7ECE9] bg-[#FAFBFA]">
          <div className="px-5 py-4 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7B8781]">Team</div>
          {days.map(day => <div key={day.toISOString()} className={`border-l border-[#E7ECE9] px-3 py-3 ${localDateKey(day) === localDateKey() ? "bg-[#EDF6F1]" : ""}`}><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#7A8680]">{format(day, "EEE")}</p><p className="mt-1 text-sm font-semibold text-[#2C3934]">{format(day, "d MMM")}</p></div>)}
        </div>
        {activeMembers.length ? activeMembers.map(member => (
          <div key={member.id} className="grid grid-cols-[200px_repeat(7,minmax(100px,1fr))] border-b border-[#EFF2F0] last:border-0">
            <div className="flex items-center gap-3 px-5 py-4"><ColleagueMarker member={member} showRole /></div>
            {days.map(day => {
              const assignments = assignmentFor(member.id, day);
              return <div key={day.toISOString()} className={`min-h-[86px] border-l border-[#EFF2F0] p-2 ${assignments.some(item => item.assignmentType === "on_call") ? "bg-[#FAF9FF]" : localDateKey(day) === localDateKey() ? "bg-[#FBFDFC]" : ""}`}>
                {assignments.map(item => <div key={item.id} className={`relative mb-1 rounded-lg border px-2 py-1.5 pr-10 text-[10px] font-semibold capitalize ${assignmentStyle[item.assignmentType]} ${item.assignmentType === "on_call" ? "ring-1 ring-[#B9B6DF]" : ""}`}><p>{item.assignmentType === "on_call" ? "On-call · highlighted" : item.assignmentType.replace("_", " ")}</p>{item.startTime ? <p className="mt-0.5 text-[9px] font-medium opacity-75">{item.startTime}–{item.endTime}</p> : null}{isManager ? <div className="absolute right-1 top-1 flex gap-0.5"><button title="Edit rota assignment" aria-label="Edit rota assignment" onClick={() => editAssignment(item)} className="flex h-4 w-4 items-center justify-center rounded bg-white/80 text-[#40534B] hover:bg-white"><Pencil className="h-2.5 w-2.5" /></button><button title="Remove rota assignment" aria-label="Remove rota assignment" onClick={() => setAssignmentPendingRemoval(item)} className="flex h-4 w-4 items-center justify-center rounded bg-[#3E4B45] text-white hover:bg-[#283630]"><Trash2 className="h-2.5 w-2.5" /></button></div> : null}</div>)}
              </div>;
            })}
          </div>
        )) : <EmptyState title="Your rota is ready to be set up" description="Add the six team members first, then build the weekly pattern that reflects how the operation actually runs." />}
      </div>
    </Panel>
    <section className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_330px]"><Panel><PanelHeading title="Distribution check" description="A light-touch view of shift and on-call fairness across the selected week." /><div className="divide-y divide-[#EEF1EF]">{counts.map(item => <div key={item.member.id} className="flex items-center gap-3 px-5 py-3.5"><ColleagueMarker member={item.member} showRole className="min-w-0 flex-1" /><span className="rounded-full bg-[#EEF4F1] px-2.5 py-1 text-[10px] font-bold text-[#3C7566]">{item.shifts} shifts</span><span className="rounded-full bg-[#F0EFFA] px-2.5 py-1 text-[10px] font-bold text-[#635B93]">{item.onCall} on-call</span></div>)}</div></Panel><div className="rounded-2xl bg-[#1C3732] p-5 text-white"><UserRoundCheck className="h-5 w-5 text-[#B9D3C9]" /><p className="mt-5 text-base font-semibold">Cover is a management promise.</p><p className="mt-2 text-sm leading-6 text-[#C4D9D1]">Use leave and unavailability rather than informal notes. A visible gap is a solvable gap.</p><Button variant="ghost" onClick={() => setWeekStart(isoWeekStart())} className="mt-4 px-0 text-xs text-white hover:bg-transparent hover:text-white"><RotateCcw className="mr-2 h-3.5 w-3.5" />Return to current week</Button></div></section>
  </div>;
}

function GapCard({ icon, label, description, alert }: { icon: React.ReactNode; label: string; description: string; alert: boolean }) { return <div className={`flex gap-4 rounded-2xl border px-5 py-4 ${alert ? "border-[#F1D5D0] bg-[#FFFAF9]" : "border-[#DCE8E0] bg-[#F8FBF9]"}`}><span className={alert ? "text-[#BF4D3F]" : "text-[#46806A]"}>{icon}</span><div><p className="text-sm font-semibold text-[#33413B]">{label}</p><p className="mt-1 text-xs leading-5 text-[#6F7C76]">{description}</p></div></div>; }