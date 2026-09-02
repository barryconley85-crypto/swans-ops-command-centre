import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { WorkEmailGate } from "@/components/WorkEmailGate";
import { useIsMobile } from "@/hooks/useMobile";
import { AlertTriangle, BarChart3, Bell, CalendarDays, CheckCheck, CircleUserRound, ClipboardCheck, HandHeart, Headphones, History, LayoutDashboard, LogOut, MessageCircleMore, PanelLeft, Users, Waypoints } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";
import { trpc } from "@/lib/trpc";
import { activePresence } from "@/lib/presence";
import { InitialsCircle } from "@/components/ColleagueMarker";
import { toast } from "sonner";

const menuItems = [
  { icon: LayoutDashboard, label: "Today", path: "/" },
  { icon: AlertTriangle, label: "Live exceptions", path: "/exceptions" },
  { icon: CircleUserRound, label: "My shift", path: "/my-shift" },
  { icon: ClipboardCheck, label: "Tasks", path: "/tasks" },
  { icon: CalendarDays, label: "Rota & on-call", path: "/rota" },
  { icon: Headphones, label: "On-call portal", path: "/on-call" },
  { icon: HandHeart, label: "Help & cover", path: "/help" },
  { icon: Waypoints, label: "Handovers", path: "/handover" },
  { icon: AlertTriangle, label: "Issue log", path: "/issues" },
  { icon: BarChart3, label: "Reports", path: "/reports" },
  { icon: MessageCircleMore, label: "Team chat", path: "/chat" },
  { icon: Users, label: "Team & performance", path: "/people" },
  { icon: History, label: "Activity history", path: "/activity", leadOnly: true },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!user) {
    return <WorkEmailGate />;
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const presence = trpc.operations.presence.list.useQuery();
  const activeTeam = activePresence(presence.data || []);
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0 bg-[#F7F9F7]"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-[86px] justify-center px-2">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#1D5C63] text-[10px] font-bold tracking-[0.08em] text-white">SW</span>
                  <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-[#24332E]">
                    Swans Ops
                    <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[0.12em] text-[#73817B]">Command centre</span>
                  </span>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-2">
              {menuItems.filter(item => !item.leadOnly || user?.isSuperuser).map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 rounded-xl transition-all font-medium ${isActive ? "bg-[#E7F0ED] text-[#1A5D59]" : "text-[#5F6C66] hover:bg-[#EEF3F0] hover:text-[#29453B]"}`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="border-t border-[#E6ECE8] p-3">
            {!isCollapsed ? <div className="mb-3 rounded-xl bg-[#EEF4F1] px-2.5 py-2"><div className="flex items-center justify-between"><p className="text-[9px] font-bold uppercase tracking-[0.11em] text-[#628176]">Active now</p><span className="text-[10px] font-semibold text-[#3D7460]">{activeTeam.length}</span></div><div className="mt-2 flex -space-x-1.5">{activeTeam.slice(0, 5).map((member: any) => <InitialsCircle key={member.userId} member={member} size="sm" active />)}{activeTeam.length > 5 ? <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#EEF4F1] bg-[#D9E7E0] text-[8px] font-bold text-[#41675A]">+{activeTeam.length - 5}</span> : null}{!activeTeam.length ? <span className="text-[11px] text-[#718079]">No one active just now</span> : null}</div></div> : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-lg px-1 py-1 hover:bg-accent/50 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border shrink-0">
                    <AvatarFallback className="text-xs font-medium">
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.role === "admin" ? "Operations lead" : "Operations team"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setLocation("/profile")} className="cursor-pointer"><CircleUserRound className="mr-2 h-4 w-4" /><span>My initials & colour</span></DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
          <main className="min-h-screen flex-1 bg-[#FCFCFA] p-4 md:p-7"><div className="mx-auto mb-3 flex max-w-[1500px] justify-end"><NotificationCentre /></div>{children}</main>
      </SidebarInset>
    </>
  );
}

function NotificationCentre() {
  const notifications = trpc.operations.notifications.list.useQuery();
  const markRead = trpc.operations.notifications.markRead.useMutation({ onSuccess: () => void notifications.refetch() });
  const seenIds = useRef<Set<number>>(new Set());
  const hydrated = useRef(false);
  const unread = (notifications.data || []).filter((item: any) => !item.readAt);
  useEffect(() => { if (notifications.isLoading) return; if (hydrated.current) (notifications.data || []).filter((item: any) => !item.readAt && !seenIds.current.has(item.id)).forEach((item: any) => toast(`${item.title}: ${item.body}`)); (notifications.data || []).forEach((item: any) => seenIds.current.add(item.id)); hydrated.current = true; }, [notifications.data, notifications.isLoading]);
  return <DropdownMenu><DropdownMenuTrigger asChild><button aria-label="Open notifications" className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-[#E0E7E2] bg-white text-[#4A5A53] shadow-sm transition-colors hover:bg-[#F3F7F5]"><Bell className="h-4 w-4" />{unread.length ? <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#B8473B] px-1 text-[9px] font-bold text-white">{unread.length > 9 ? "9+" : unread.length}</span> : null}</button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-80 border-[#E0E7E2] p-1"><div className="flex items-center justify-between px-3 py-2"><p className="text-xs font-bold text-[#35443D]">Notifications</p><span className="text-[10px] text-[#7B8781]">{unread.length ? `${unread.length} unread` : "All caught up"}</span></div>{notifications.data?.length ? notifications.data.slice(0, 8).map((item: any) => <DropdownMenuItem key={item.id} onClick={() => !item.readAt && markRead.mutate({ id: item.id })} className={`flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2.5 ${item.readAt ? "opacity-60" : "bg-[#F4F8F5]"}`}><ClipboardCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#2B7865]" /><span className="min-w-0"><span className="block text-xs font-semibold text-[#3A4942]">{item.title}</span><span className="mt-0.5 block truncate text-[11px] text-[#718078]">{item.body}</span></span></DropdownMenuItem>) : <p className="px-3 py-6 text-center text-xs text-[#819089]">New task assignments will appear here.</p>}{unread.length ? <button onClick={() => unread.forEach((item: any) => markRead.mutate({ id: item.id }))} className="flex w-full items-center justify-center gap-1 rounded-lg px-3 py-2 text-[11px] font-semibold text-[#1D5C63] hover:bg-[#F2F7F4]"><CheckCheck className="h-3.5 w-3.5" />Mark all read</button> : null}</DropdownMenuContent></DropdownMenu>;
}
