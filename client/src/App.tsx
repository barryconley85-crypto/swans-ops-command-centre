import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Handovers from "./pages/Handovers";
import Home from "./pages/Home";
import HelpRequests from "./pages/HelpRequests";
import Issues from "./pages/Issues";
import OnCallPortal from "./pages/OnCallPortal";
import QuickOnCall from "./pages/QuickOnCall";
import People from "./pages/People";
import Readiness from "./pages/Readiness";
import Reports from "./pages/Reports";
import Rota from "./pages/Rota";
import TeamChat from "./pages/TeamChat";
import Tasks from "./pages/Tasks";
import MyShift from "./pages/MyShift";

function DashboardPage({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={() => <DashboardPage><Home /></DashboardPage>} />
      <Route path={"/my-shift"} component={() => <DashboardPage><MyShift /></DashboardPage>} />
      <Route path={"/help"} component={() => <DashboardPage><HelpRequests /></DashboardPage>} />
      <Route path={"/tasks"} component={() => <DashboardPage><Tasks /></DashboardPage>} />
      <Route path={"/rota"} component={() => <DashboardPage><Rota /></DashboardPage>} />
      <Route path={"/on-call"} component={() => <DashboardPage><OnCallPortal /></DashboardPage>} />
      <Route path={"/quick-on-call"} component={QuickOnCall} />
      <Route path={"/chat"} component={() => <DashboardPage><TeamChat /></DashboardPage>} />
      <Route path={"/handover"} component={() => <DashboardPage><Handovers /></DashboardPage>} />
      <Route path={"/issues"} component={() => <DashboardPage><Issues /></DashboardPage>} />
      <Route path={"/readiness"} component={() => <DashboardPage><Readiness /></DashboardPage>} />
      <Route path={"/reports"} component={() => <DashboardPage><Reports /></DashboardPage>} />
      <Route path={"/people"} component={() => <DashboardPage><People /></DashboardPage>} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
