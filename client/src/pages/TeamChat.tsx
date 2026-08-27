import { useAuth } from "@/_core/hooks/useAuth";
import { EmptyState, LoadError, PageHeader, Panel } from "@/components/WorkspacePrimitives";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { format } from "date-fns";
import { MessageCircleMore, Send, UsersRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

export default function TeamChat() {
  const { user } = useAuth();
  const messages = trpc.operations.chat.messages.useQuery();
  const send = trpc.operations.chat.send.useMutation({
    onSuccess: async () => { setDraft(""); await messages.refetch(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages.data?.length]);

  const submit = () => {
    if (!draft.trim()) return toast.error("Write a message before sending it.");
    send.mutate({ body: draft });
  };

  if (messages.isError) return <LoadError message="The team conversation could not be loaded. No messages have been changed." onRetry={() => void messages.refetch()} />;

  return <div className="mx-auto max-w-[1120px] pb-10">
    <PageHeader eyebrow="Live operations conversation" title="Team chat" description="Use one shared, work-email-only channel for real-time context, quick coordination and clear next steps. Keep formal decisions in handovers or the on-call portal." />
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_270px]">
      <Panel className="flex min-h-[610px] flex-col">
        <div className="flex items-center justify-between border-b border-[#EDF0EE] px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EAF3EF] text-[#2E7664]"><MessageCircleMore className="h-4 w-4" /></span><div><h2 className="text-sm font-semibold text-[#273630]">Operations channel</h2><p className="mt-0.5 text-xs text-[#72817A]">Visible to authenticated Swans Travel operations users.</p></div></div><span className="rounded-full bg-[#EDF5F1] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#337362]">Live</span></div>
        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-[#FCFCFA] px-4 py-5 sm:px-5">{messages.isLoading ? <LoadingMessages /> : messages.data?.length ? messages.data.map((message: any) => <MessageRow key={message.id} message={message} isMine={message.authorUserId === user?.id} />) : <EmptyState title="The team channel is ready" description="Use the first message to share today’s live operational context. Keep it brief and action-focused." />}</div>
        <div className="border-t border-[#E6ECE8] bg-white p-4"><div className="flex gap-3"><Textarea value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit(); }} placeholder="Share an operational update…" className="min-h-[76px] resize-none border-[#DCE6E0] bg-[#FCFDFC] text-sm" maxLength={1000} /><Button onClick={submit} disabled={!draft.trim() || send.isPending} className="h-auto shrink-0 bg-[#1D5C63] px-4 hover:bg-[#164B50]" aria-label="Send message"><Send className="h-4 w-4" /></Button></div><p className="mt-2 text-[11px] text-[#83908A]">Press Ctrl/⌘ + Enter to send. Avoid personal, customer or payment information.</p></div>
      </Panel>
      <aside className="space-y-4"><div className="rounded-2xl bg-[#1C3732] p-5 text-white"><UsersRound className="h-5 w-5 text-[#B8D7CA]" /><h2 className="mt-5 text-base font-semibold">Keep the channel useful.</h2><p className="mt-2 text-sm leading-6 text-[#C5DAD1]">Use chat for immediate coordination. Put ownership, deadlines and closure evidence into a handover, issue, task or on-call action.</p></div><div className="rounded-2xl border border-[#E0E7E2] bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#77847E]">Good chat updates</p><p className="mt-3 text-sm leading-6 text-[#53635C]">State the situation, the action being taken, who owns it, and when the next update will be available.</p></div></aside>
    </div>
  </div>;
}

function MessageRow({ message, isMine }: { message: any; isMine: boolean }) {
  return <article className={`flex items-end gap-2.5 ${isMine ? "flex-row-reverse" : ""}`}><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: message.authorColour || "#1D5C63" }}>{message.authorInitials || "SW"}</span><div className={`max-w-[82%] rounded-2xl px-4 py-3 ${isMine ? "rounded-br-md bg-[#1D5C63] text-white" : "rounded-bl-md bg-[#EFF4F1] text-[#2D3A35]"}`}><div className={`mb-1 flex items-center gap-2 text-[10px] ${isMine ? "text-[#D3E6DE]" : "text-[#74827B]"}`}><span className="font-bold">{message.authorName}</span><span>{format(new Date(message.createdAt), "d MMM, HH:mm")}</span></div><p className="whitespace-pre-wrap text-sm leading-6">{message.body}</p></div></article>;
}

function LoadingMessages() { return <div className="space-y-4">{[1, 2, 3].map(index => <div key={index} className={`h-20 w-3/4 animate-pulse rounded-2xl bg-[#EFF3F0] ${index === 2 ? "ml-auto" : ""}`} />)}</div>; }
