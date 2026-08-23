import { Profiler, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
import {
  initObservability,
  reportRender,
  shouldShowOverlay,
} from "./observability";
import ObservabilityOverlay from "./ObservabilityOverlay.jsx";

// Start CPU/memory spike tracking (long tasks, heap sampling, event-loop lag).
initObservability();

const overlay = shouldShowOverlay() ? <ObservabilityOverlay /> : null;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Profiler id="App" onRender={reportRender}>
      <App />
    </Profiler>
    {overlay}
  </StrictMode>,
)
