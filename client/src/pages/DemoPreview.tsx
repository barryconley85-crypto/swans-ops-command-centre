import { useMemo, useState } from "react";
import { BarChart3, Bus, CheckCircle2, ChevronRight, CircleAlert, FileText, LayoutDashboard, MessageSquareWarning, PoundSterling, ShieldCheck } from "lucide-react";

type Tab = "dashboard" | "complaints" | "report";

const sampleComplaints = [
  { ref: "CMP-1042", date: "21 Oct 2026", customer: "Wigan Supporters Club", driver: "J. Brown", vehicle: "YX19 KLM", category: "Late arrival", status: "Resolved", outcome: "£75 credit", amount: 75 },
  { ref: "CMP-1041", date: "20 Oct 2026", customer: "Northside School", driver: "A. Quinn", vehicle: "YN18 SWA", category: "Vehicle cleanliness", status: "Investigating", outcome: "Driver meeting booked", amount: 0 },
  { ref: "CMP-1039", date: "19 Oct 2026", customer: "Private hire customer", driver: "M. Evans", vehicle: "YX19 KLM", category: "Service issue", status: "Resolved", outcome: "£120 refund", amount: 120 },
];

export default function DemoPreview() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [period, setPeriod] = useState("This week");
  const [showBanner, setShowBanner] = useState(true);
  const totalRefunds = useMemo(() => sampleComplaints.reduce((sum, item) => sum + item.amount, 0), []);
  return <div className="min-h-screen bg-[#F5F7F5] text-[#25352D]">
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
        <span><strong>DEMO MODE</strong> · Sample records only. No login, no live data, and changes are not saved.</span>
        {showBanner && <button onClick={() => setShowBanner(false)} className="rounded-md px-2 py-1 hover:bg-amber-100" aria-label="Dismiss demo notice">×</button>}
      </div>
    </div>
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div><div className="text-xs font-bold uppercase tracking-[.18em] text-[#6B8175]">Swans Travel</div><h1 className="mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">Operations Command Centre</h1><p className="mt-1 text-sm text-[#738078]">Safe preview · fictional sample data</p></div>
        <div className="flex items-center gap-2 rounded-full border border-[#DDE7E0] bg-white px-3 py-2 text-sm"><ShieldCheck className="h-4 w-4 text-emerald-700"/> Preview only</div>
      </header>
      <nav className="mb-6 flex flex-wrap gap-2">
        {([{ id: "dashboard", label: "Dashboard", icon: LayoutDashboard }, { id: "complaints", label: "Complaints", icon: MessageSquareWarning }, { id: "report", label: "Weekly MD report", icon: FileText }] as const).map(item => <button key={item.id} onClick={() => setTab(item.id)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === item.id ? "bg-[#1D5C53] text-white shadow-sm" : "border border-[#DDE7E0] bg-white text-[#4F6257] hover:bg-[#EEF4F0]"}`}><item.icon className="h-4 w-4"/>{item.label}</button>)}
      </nav>
      {tab === "dashboard" && <section>
        <div className="mb-5"><h2 className="text-xl font-bold">Complaints overview</h2><p className="mt-1 text-sm text-[#738078]">A sample dashboard showing the type of summary and trends available.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[{ label: "Complaints this week", value: "8", note: "3 still open", icon: MessageSquareWarning }, { label: "Refunds and credits", value: `£${totalRefunds}`, note: "Across resolved cases", icon: PoundSterling }, { label: "Open complaints", value: "3", note: "1 awaiting customer", icon: CircleAlert }, { label: "Resolved", value: "5", note: "62.5% of this week", icon: CheckCircle2 }].map(k => <div key={k.label} className="rounded-2xl border border-[#E0E8E2] bg-white p-5 shadow-sm"><div className="flex items-center justify-between text-sm text-[#68796F]"><span>{k.label}</span><k.icon className="h-5 w-5 text-[#438172]"/></div><div className="mt-3 text-3xl font-extrabold">{k.value}</div><div className="mt-1 text-xs text-[#819087]">{k.note}</div></div>)}
        </div>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#E0E8E2] bg-white p-5"><h3 className="font-bold">Needs attention</h3><div className="mt-4 space-y-3">{[{ title: "Northside School", detail: "Vehicle cleanliness · 2 days open", tone: "text-amber-700 bg-amber-50" }, { title: "Private hire customer", detail: "Awaiting final outcome", tone: "text-rose-700 bg-rose-50" }, { title: "Wigan Supporters Club", detail: "Resolved · £75 credit", tone: "text-emerald-700 bg-emerald-50" }].map(x => <div key={x.title} className="flex items-center justify-between gap-3 rounded-xl border border-[#EDF1ED] p-3"><div><div className="text-sm font-semibold">{x.title}</div><div className="mt-1 text-xs text-[#7B8981]">{x.detail}</div></div><ChevronRight className="h-4 w-4 shrink-0 text-[#84938A]"/></div>)}</div></div>
          <div className="rounded-2xl border border-[#E0E8E2] bg-white p-5"><h3 className="font-bold">Patterns to review</h3><div className="mt-4 space-y-4">{[{ label: "YX19 KLM", detail: "2 complaints linked to this vehicle", width: "78%" }, { label: "Late arrival", detail: "3 complaints in the selected period", width: "60%" }, { label: "J. Brown", detail: "2 complaints linked to this driver", width: "45%" }].map(x => <div key={x.label}><div className="flex justify-between gap-3 text-sm"><strong>{x.label}</strong><span className="text-xs text-[#7B8981]">{x.detail}</span></div><div className="mt-2 h-2 rounded-full bg-[#EDF2EE]"><div className="h-2 rounded-full bg-[#4F9380]" style={{ width: x.width }}/></div></div>)}</div></div>
        </div>
      </section>}
      {tab === "complaints" && <section><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Complaints register</h2><p className="mt-1 text-sm text-[#738078]">Fictional examples showing vehicle, outcome and refund fields.</p></div><span className="rounded-lg bg-white px-3 py-2 text-xs text-[#68796F] ring-1 ring-[#DDE7E0]">3 sample records</span></div>
        <div className="overflow-hidden rounded-2xl border border-[#E0E8E2] bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#F1F6F2] text-xs uppercase tracking-wide text-[#617368]"><tr>{["Reference / date", "Customer", "Driver", "Vehicle", "Category", "Status", "Refund / credit"].map(x => <th key={x} className="px-4 py-3 font-bold">{x}</th>)}</tr></thead><tbody>{sampleComplaints.map((c, i) => <tr key={c.ref} className={i ? "border-t border-[#EDF1ED]" : ""}><td className="px-4 py-4"><div className="font-bold">{c.ref}</div><div className="mt-1 text-xs text-[#819087]">{c.date}</div></td><td className="px-4 py-4">{c.customer}</td><td className="px-4 py-4">{c.driver}</td><td className="px-4 py-4"><span className="rounded-md bg-[#F1F5F2] px-2 py-1 font-mono text-xs">{c.vehicle}</span></td><td className="px-4 py-4">{c.category}</td><td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c.status === "Resolved" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{c.status}</span></td><td className="px-4 py-4 font-semibold">{c.amount ? `£${c.amount.toFixed(2)}` : "£0.00"}</td></tr>)}</tbody></table></div></div>
        <div className="mt-4 rounded-xl border border-dashed border-[#C9D9CE] bg-white p-4 text-sm text-[#6C7D72]"><Bus className="mr-2 inline h-4 w-4"/> In the live app, the vehicle selector is intended to use the fleet master list. This preview uses sample vehicle registrations.</div>
      </section>}
      {tab === "report" && <section><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Weekly complaints report · MD summary</h2><p className="mt-1 text-sm text-[#738078]">A preview of the email-ready management summary.</p></div><select value={period} onChange={e => setPeriod(e.target.value)} className="rounded-xl border border-[#DDE7E0] bg-white px-3 py-2 text-sm"><option>This week</option><option>Last week</option><option>Last 4 weeks</option></select></div>
        <div className="rounded-2xl border border-[#E0E8E2] bg-white p-5 shadow-sm md:p-7"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E7EEE8] pb-5"><div><div className="text-xs font-bold uppercase tracking-[.16em] text-[#6B8175]">Swans Travel · Management report</div><h3 className="mt-2 text-2xl font-extrabold">{period} complaints summary</h3><p className="mt-1 text-sm text-[#7B8981]">Illustrative data only · not an operational report</p></div><BarChart3 className="h-8 w-8 text-[#438172]"/></div>
          <div className="grid gap-3 py-5 sm:grid-cols-3"><div className="rounded-xl bg-[#F4F7F4] p-4"><div className="text-xs text-[#718177]">Logged</div><div className="mt-1 text-2xl font-extrabold">8</div></div><div className="rounded-xl bg-[#F4F7F4] p-4"><div className="text-xs text-[#718177]">Resolved</div><div className="mt-1 text-2xl font-extrabold">5</div></div><div className="rounded-xl bg-[#F4F7F4] p-4"><div className="text-xs text-[#718177]">Refunds / credits</div><div className="mt-1 text-2xl font-extrabold">£{totalRefunds.toFixed(2)}</div></div></div>
          <h4 className="font-bold">Driver and vehicle patterns</h4><p className="mt-2 text-sm leading-6 text-[#5E7065]">The sample records show repeat references to vehicle YX19 KLM and driver J. Brown. In a live report, this section should be calculated from complaints in the selected date range and should flag patterns for management review, rather than treating a small sample as proof of a trend.</p>
          <h4 className="mt-5 font-bold">Outcomes and financial impact</h4><div className="mt-3 space-y-2">{sampleComplaints.map(c => <div key={c.ref} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#EDF1ED] px-3 py-3 text-sm"><div><div className="font-semibold">{c.ref} · {c.customer}</div><div className="mt-1 text-xs text-[#7B8981]">{c.outcome}</div></div><div className="font-bold">{c.amount ? `£${c.amount.toFixed(2)}` : "£0.00"}</div></div>)}</div>
          <button onClick={() => window.print()} className="mt-6 rounded-xl bg-[#1D5C53] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#174A43]">Print / save report as PDF</button>
        </div>
      </section>}
      <footer className="mt-8 border-t border-[#E0E8E2] pt-4 text-xs text-[#829087]">Test interface only. This is separate from the live Operations Command Centre and does not read or write production records.</footer>
    </div>
  </div>;
}
