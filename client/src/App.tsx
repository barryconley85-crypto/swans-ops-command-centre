import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import Handovers from "./pages/Handovers";
import Home from "./pages/Home";
import Issues from "./pages/Issues";
import People from "./pages/People";
import Readiness from "./pages/Readiness";
import Rota from "./pages/Rota";
import Tasks from "./pages/Tasks";

function DashboardPage({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={() => <DashboardPage><Home /></DashboardPage>} />
      <Route path={"/tasks"} component={() => <DashboardPage><Tasks /></DashboardPage>} />
      <Route path={"/rota"} component={() => <DashboardPage><Rota /></DashboardPage>} />
      <Route path={"/handover"} component={() => <DashboardPage><Handovers /></DashboardPage>} />
      <Route path={"/issues"} component={() => <DashboardPage><Issues /></DashboardPage>} />
      <Route path={"/readiness"} component={() => <DashboardPage><Readiness /></DashboardPage>} />
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
