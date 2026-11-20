import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useEffect } from "react";
import { useWorkspace } from "./contexts/WorkspaceContext";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Handovers from "./pages/Handovers";
import Home from "./pages/Home";
import HelpRequests from "./pages/HelpRequests";
import Issues from "./pages/Issues";
import Complaints from "./pages/Complaints";
import OnCallPortal from "./pages/OnCallPortal";
import QuickOnCall from "./pages/QuickOnCall";
import People from "./pages/People";
import Reports from "./pages/Reports";
import Rota from "./pages/Rota";
import TeamChat from "./pages/TeamChat";
import Tasks from "./pages/Tasks";
import MyShift from "./pages/MyShift";
import ShiftCheck from "./pages/ShiftCheck";
import Profile from "./pages/Profile";
import ActivityHistory from "@/pages/ActivityHistory";
import Exceptions from "@/pages/Exceptions";
import DriverSignOn, { PublicDriverSignOn } from "@/pages/DriverSignOn";
import DriverAttendance from "@/pages/DriverAttendance";
import ComplianceCentre from "@/pages/ComplianceCentre";
import CheltenhamSupervisor from "@/pages/CheltenhamSupervisor";
import Training from "@/pages/Training";
import PublicVehicleFamiliarisation from "@/pages/PublicVehicleFamiliarisation";

function DashboardPage({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

// Keep route component identities stable. WorkspaceContext updates whenever a
// Firestore collection changes, so Router can render frequently. Inline route
// component functions are recreated on every render, which makes Wouter
// remount the active page and discard unsaved form input.
function HomeRoute() { return <DashboardPage><Home /></DashboardPage>; }
function ExceptionsRoute() { return <DashboardPage><Exceptions /></DashboardPage>; }
function MyShiftRoute() { return <DashboardPage><MyShift /></DashboardPage>; }
function ShiftCheckRoute() { return <DashboardPage><ShiftCheck /></DashboardPage>; }
function ProfileRoute() { return <DashboardPage><Profile /></DashboardPage>; }
function ActivityRoute() { return <DashboardPage><ActivityHistory /></DashboardPage>; }
function HelpRoute() { return <DashboardPage><HelpRequests /></DashboardPage>; }
function TasksRoute() { return <DashboardPage><Tasks /></DashboardPage>; }
function RotaRoute() { return <DashboardPage><Rota /></DashboardPage>; }
function OnCallRoute() { return <DashboardPage><OnCallPortal /></DashboardPage>; }
function ChatRoute() { return <DashboardPage><TeamChat /></DashboardPage>; }
function HandoverRoute() { return <DashboardPage><Handovers /></DashboardPage>; }
function IssuesRoute() { return <DashboardPage><Issues /></DashboardPage>; }
function ComplaintsRoute() { return <DashboardPage><Complaints /></DashboardPage>; }
function ReportsRoute() { return <DashboardPage><Reports /></DashboardPage>; }
function PeopleRoute() { return <DashboardPage><People /></DashboardPage>; }
function DriverSignOnRoute() { return <DashboardPage><DriverSignOn /></DashboardPage>; }
function DriverAttendanceRoute() { return <DashboardPage><DriverAttendance /></DashboardPage>; }
function ComplianceRoute() { return <DashboardPage><ComplianceCentre /></DashboardPage>; }
function TrainingRoute() { return <DashboardPage><Training /></DashboardPage>; }

function Router() {
  const { profile } = useWorkspace();
  const [location, setLocation] = useLocation();
  useEffect(() => { if (profile?.memberRole === "depot_supervisor" && location !== "/cheltenham-supervisor" && location !== "/vehicle-familiarisation") setLocation("/cheltenham-supervisor"); }, [profile, location, setLocation]);
  // The driver familiarisation page is a public training link. Keep it reachable even
  // when the browser is already signed in as a restricted depot supervisor.
  if (location === "/vehicle-familiarisation") return <PublicVehicleFamiliarisation />;
  if (profile?.memberRole === "depot_supervisor") return <CheltenhamSupervisor />;
  return (
    <Switch>
      <Route path={"/cheltenham-supervisor"} component={CheltenhamSupervisor} />
      <Route path={"/"} component={HomeRoute} />
      <Route path={"/exceptions"} component={ExceptionsRoute} />
      <Route path={"/my-shift"} component={MyShiftRoute} />
      <Route path={"/shift-check"} component={ShiftCheckRoute} />
      <Route path={"/profile"} component={ProfileRoute} />
      <Route path={"/activity"} component={ActivityRoute} />
      <Route path={"/help"} component={HelpRoute} />
      <Route path={"/tasks"} component={TasksRoute} />
      <Route path={"/rota"} component={RotaRoute} />
      <Route path={"/on-call"} component={OnCallRoute} />
      <Route path={"/quick-on-call"} component={QuickOnCall} />
      <Route path={"/driver-sign-on/:depot"} component={props => <PublicDriverSignOn depot={props.params.depot} />} />
      <Route path={"/chat"} component={ChatRoute} />
      <Route path={"/handover"} component={HandoverRoute} />
      <Route path={"/issues"} component={IssuesRoute} />
      <Route path={"/complaints"} component={ComplaintsRoute} />
      <Route path={"/reports"} component={ReportsRoute} />
      <Route path={"/people"} component={PeopleRoute} />
      <Route path={"/driver-sign-on"} component={DriverSignOnRoute} />
      <Route path={"/driver-attendance"} component={DriverAttendanceRoute} />
      <Route path={"/compliance"} component={ComplianceRoute} />
      <Route path={"/vehicle-familiarisation"} component={PublicVehicleFamiliarisation} />
      <Route path={"/training"} component={TrainingRoute} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
