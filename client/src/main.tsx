import { createRoot } from "react-dom/client";
import App from "./App";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <WorkspaceProvider><App /></WorkspaceProvider>
);
