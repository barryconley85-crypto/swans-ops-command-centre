import { EmptyState, PageHeader, Panel, PanelHeading } from "@/components/WorkspacePrimitives";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/_core/hooks/useAuth";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { activityLabel } from "@/lib/auditHistory";
import { History, LockKeyhole } from "lucide-react";

type AuditEvent = { _docId: string; actorName?: string; actorInitials?: string; actorColour?: string; action?: string; targetType?: string; summary?: string; createdAt?: number };

export default function ActivityHistory() {
  const { user } = useAuth();
  const { state } = useWorkspace();
  if (!user?.isSuperuser) return <div className="mx-auto max-w-[1120px] pb-10"><PageHeader eyebrow="Protected management record" title="Activity history" description="This register is available only to the operations lead." /><Panel className="p-8"><div className="flex items-start gap-3"><LockKeyhole className="mt-0.5 h-5 w-5 text-[#A46B27]" /><p className="text-sm leading-6 text-[#56645D]">Access is limited to the operations lead because change history can contain operational context.</p></div></Panel></div>;
  const events = ([...(state.auditLogs || [])] as AuditEvent[]).sort((left, right) => (right.createdAt || 0) - (left.createdAt || 0));
  return <div className="mx-auto max-w-[1120px] pb-10"><PageHeader eyebrow="Transparent operational record" title="Activity history" description="A factual record of sign-ins and material changes. It does not track time spent in the app, location or productivity." /><Panel><PanelHeading title="Recent workspace activity" description={`${events.length} retained event${events.length === 1 ? "" : "s"}. New records appear automatically.`} action={<span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF3EF] text-[#2E7664]"><History className="h-4 w-4" /></span>} /><div className="divide-y divide-[#EDF0EE]">{events.length ? events.slice(0, 150).map(event => <article key={event._docId} className="flex gap-3 px-5 py-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: event.actorColour || "#5E7B70" }}>{event.actorInitials || "SW"}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-[#34423B]">{event.actorName || "Team member"}</p><Badge className="border-0 bg-[#EEF4F1] text-[9px] uppercase tracking-[0.08em] text-[#39705F]">{activityLabel(event.action || "")}</Badge><span className="text-[11px] text-[#83908A]">{event.createdAt ? new Date(event.createdAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "Time unavailable"}</span></div><p className="mt-1 text-sm leading-5 text-[#56645D]">{event.summary || "Workspace activity recorded."}</p></div></article>) : <EmptyState title="No activity recorded yet" description="Sign-ins and future operational changes will appear here automatically." />}</div></Panel></div>;
}
