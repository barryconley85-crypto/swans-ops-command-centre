import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="mb-7 flex flex-col gap-5 border-b border-[#E3E9E5] pb-6 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#71817A]">{eyebrow}</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[#1C2924]">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#69756F]">{description}</p></div>{actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}</header>;
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("overflow-hidden rounded-2xl border border-[#E0E7E2] bg-white shadow-[0_18px_38px_-32px_rgba(18,48,41,0.46)]", className)}>{children}</section>;
}

export function PanelHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="flex items-center justify-between gap-4 border-b border-[#EDF0EE] px-5 py-4"><div><h2 className="text-sm font-semibold text-[#28352F]">{title}</h2>{description ? <p className="mt-0.5 text-xs text-[#77847E]">{description}</p> : null}</div>{action}</div>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="px-6 py-12 text-center"><div className="mx-auto h-2.5 w-2.5 rounded-full bg-[#8BB3A4]" /><p className="mt-4 text-sm font-semibold text-[#34413C]">{title}</p><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#7B8781]">{description}</p>{action ? <div className="mt-4">{action}</div> : null}</div>;
}

export function LoadError({ message = "We could not load this operational view.", onRetry }: { message?: string; onRetry: () => void }) {
  return <div className="mx-auto flex min-h-[48vh] max-w-md flex-col items-center justify-center rounded-3xl border border-[#F0D5D0] bg-[#FFFCFB] px-7 py-10 text-center shadow-[0_18px_38px_-32px_rgba(18,48,41,0.3)]"><span className="h-2.5 w-2.5 rounded-full bg-[#C45A4C]" /><h1 className="mt-4 text-lg font-semibold text-[#3C403D]">Connection needs attention</h1><p className="mt-2 text-sm leading-6 text-[#75807A]">{message}</p><Button onClick={onRetry} className="mt-5 bg-[#1D5C63] hover:bg-[#164B50]">Try again</Button></div>;
}

export function TinyButton({ children, ...props }: React.ComponentProps<typeof Button>) { return <Button size="sm" variant="outline" className="h-8 border-[#DCE6E0] bg-white text-xs text-[#43534C] hover:bg-[#F2F7F4]" {...props}>{children}</Button>; }
