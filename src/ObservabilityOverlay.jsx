import { useEffect, useState } from "react";
import {
  clearObservability,
  getSnapshot,
  isObservabilityEnabled,
  subscribe,
} from "./observability";
import "./ObservabilityOverlay.css";

function formatTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString();
}

function formatBytes(mb) {
  if (!mb) return "0 MB";
  return mb >= 1024 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

function spikeTitle(spike) {
  switch (spike.type) {
    case "cpu-long-task":
      return `Long task: ${spike.durationMs}ms`;
    case "cpu-event-loop-lag":
      return `Event loop lag: ${spike.lagMs}ms`;
    case "trace":
      return `Trace ${spike.name}: ${spike.durationMs}ms`;
    case "render-slow":
      return `Slow render <${spike.id}>: ${spike.actualDuration}ms (${spike.phase})`;
    case "memory-jump":
      return `Memory jump: +${spike.jumpMB}MB to ${spike.usedMB}MB`;
    case "memory-sustained-growth":
      return `Memory growth: +${spike.growthMB}MB over ${spike.windowMs / 60000}min`;
    default:
      return spike.type;
  }
}

function spikeDetail(spike) {
  switch (spike.type) {
    case "cpu-long-task": {
      const src = spike.attribution?.containerSrc ?? spike.attribution?.name;
      return src ? `in ${src}` : "attribution unavailable";
    }
    case "memory-jump":
      return `from ${spike.fromMB}MB`;
    default:
      return spike.thresholdMs ? `threshold ${spike.thresholdMs}ms` : "";
  }
}

function spikeIcon(spike) {
  switch (spike.type) {
    case "cpu-long-task":
      return "⚡";
    case "cpu-event-loop-lag":
      return "⏳";
    case "trace":
      return "🛠";
    case "render-slow":
      return "🧩";
    case "memory-jump":
    case "memory-sustained-growth":
      return "🧠";
    default:
      return "•";
  }
}

function HeapSparkline({ samples, height = 36 }) {
  if (samples.length < 2) {
    return <div className="obs__sparkline obs__sparkline--empty">collecting…</div>;
  }
  const width = 100;
  const chartHeight = 30;
  const values = samples.map((sample) => sample.usedMB);
  const max = Math.max(...values, 1);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = chartHeight - (value / max) * chartHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className="obs__sparkline"
      viewBox={`0 0 ${width} ${chartHeight}`}
      preserveAspectRatio="none"
      height={height}
      role="img"
      aria-label="JS heap usage over time"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  );
}

/**
 * Floating in-app panel showing live CPU/memory spike data from
 * src/observability.js. Toggle with the floating button or Ctrl/Cmd+Shift+O.
 */
export default function ObservabilityOverlay() {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState(() => getSnapshot());
  const [copied, setCopied] = useState(false);

  useEffect(() => subscribe(setSnapshot), []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        (event.key === "O" || event.key === "o")
      ) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!isObservabilityEnabled()) return null;

  const copyReport = () => {
    const report = JSON.stringify(snapshot, null, 2);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(report).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      });
    } else {
      console.info("[observability] snapshot:", report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const breakdownRows = Array.isArray(snapshot.heap.breakdown)
    ? snapshot.heap.breakdown
    : [];

  return (
    <div className="obs">
      <button
        type="button"
        className="obs__toggle"
        aria-label={open ? "Hide observability panel" : "Show observability panel"}
        aria-expanded={open}
        title="Observability (Ctrl/Cmd+Shift+O)"
        onClick={() => setOpen((value) => !value)}
      >
        {snapshot.counters.spikes > 0 ? "📊!" : "📊"}
      </button>

      {open && (
        <div className="obs__panel" role="dialog" aria-label="Observability panel">
          <div className="obs__header">
            <span className="obs__title">Observability</span>
            <span className="obs__gauge">
              heap{" "}
              {snapshot.memory.supported
                ? formatBytes(snapshot.heap.usedMB)
                : "n/a"}
              {snapshot.heap.peakMB > 0 && (
                <span className="obs__gauge-sub"> peak {formatBytes(snapshot.heap.peakMB)}</span>
              )}
            </span>
            <span className="obs__gauge">lag {Math.round(snapshot.lagMs)}ms</span>
            <span className="obs__gauge obs__gauge--spikes">
              {snapshot.counters.spikes} spikes
            </span>
            <div className="obs__actions">
              <button type="button" onClick={copyReport}>
                {copied ? "Copied" : "Copy"}
              </button>
              <button type="button" onClick={clearObservability}>
                Clear
              </button>
              <button
                type="button"
                aria-label="Close observability panel"
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>
          </div>

          <section className="obs__section">
            <h3 className="obs__section-title">Spikes</h3>
            {snapshot.spikes.length === 0 ? (
              <p className="obs__empty">
                No spikes yet. CPU spikes appear as long tasks or event-loop
                lag; memory jumps appear after heap sampling.
              </p>
            ) : (
              <ul className="obs__list">
                {snapshot.spikes.slice(0, 20).map((spike, index) => (
                  <li
                    key={`${spike.time}-${spike.type}-${index}`}
                    className={`obs__item obs__item--${spike.type}`}
                  >
                    <span className="obs__item-icon">{spikeIcon(spike)}</span>
                    <span className="obs__item-body">
                      <span className="obs__item-title">{spikeTitle(spike)}</span>
                      <span className="obs__item-meta">
                        {spikeDetail(spike)} · {formatTime(spike.time)} ·{" "}
                        {spike.route || "/"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="obs__section">
            <h3 className="obs__section-title">Long tasks</h3>
            {snapshot.longTasks.length === 0 ? (
              <p className="obs__empty">No long tasks captured.</p>
            ) : (
              <ul className="obs__list">
                {snapshot.longTasks.slice(0, 10).map((task, index) => (
                  <li key={`${task.time}-${index}`} className="obs__item">
                    <span className="obs__item-icon">⚡</span>
                    <span className="obs__item-body">
                      <span className="obs__item-title">
                        {task.durationMs}ms main-thread block
                      </span>
                      <span className="obs__item-meta">
                        {task.attribution?.containerSrc ??
                          task.attribution?.name ??
                          "attribution unavailable"}{" "}
                        · {formatTime(task.time)} · {task.route || "/"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="obs__section">
            <h3 className="obs__section-title">Memory</h3>
            {snapshot.memory.supported ? (
              <>
                <HeapSparkline samples={snapshot.memorySamples} />
                <div className="obs__memory-stats">
                  <span>used {formatBytes(snapshot.heap.usedMB)}</span>
                  <span>total {formatBytes(snapshot.heap.totalMB)}</span>
                  <span>peak {formatBytes(snapshot.heap.peakMB)}</span>
                </div>
              </>
            ) : (
              <p className="obs__empty obs__memory-note">
                Heap API unavailable ({snapshot.memory.api}). Open the app in
                Chrome/Edge for heap sampling, or enable cross-origin isolation
                for measureUserAgentSpecificMemory().
              </p>
            )}
            <div className="obs__memory-stats">
              <span>feed {snapshot.gauges["feed.events"]} events</span>
              <span>nsfw cache {snapshot.gauges["nsfw.cache"]}</span>
              <span>media {snapshot.gauges["media.elements"]}</span>
            </div>
            {breakdownRows.length > 0 && (
              <ul className="obs__list obs__list--breakdown">
                {breakdownRows.slice(0, 8).map((row, index) => (
                  <li key={`${row.type}-${index}`} className="obs__item">
                    <span className="obs__item-body">
                      <span className="obs__item-title">{row.type}</span>
                      <span className="obs__item-meta">
                        {row.attribution
                          ? `${row.attribution.url || row.attribution.scope || "?"} · `
                          : ""}
                        {formatBytes(row.bytes / (1024 * 1024))}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="obs__section">
            <h3 className="obs__section-title">Traces</h3>
            {snapshot.traces.length === 0 ? (
              <p className="obs__empty">No traces recorded.</p>
            ) : (
              <ul className="obs__list">
                {snapshot.traces.slice(0, 10).map((entry, index) => (
                  <li key={`${entry.time}-${index}`} className="obs__item">
                    <span className="obs__item-icon">🛠</span>
                    <span className="obs__item-body">
                      <span className="obs__item-title">
                        {entry.name}: {entry.durationMs}ms
                      </span>
                      <span className="obs__item-meta">
                        heap Δ{" "}
                        {entry.heapDeltaMB === null
                          ? "n/a"
                          : `${entry.heapDeltaMB >= 0 ? "+" : ""}${entry.heapDeltaMB}MB`}{" "}
                        · {formatTime(entry.time)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="obs__section">
            <h3 className="obs__section-title">Renders</h3>
            {snapshot.renders.length === 0 ? (
              <p className="obs__empty">No render timings recorded.</p>
            ) : (
              <ul className="obs__list">
                {snapshot.renders.slice(0, 10).map((entry, index) => (
                  <li key={`${entry.time}-${index}`} className="obs__item">
                    <span className="obs__item-icon">🧩</span>
                    <span className="obs__item-body">
                      <span className="obs__item-title">
                        {entry.id}: {entry.actualDuration}ms ({entry.phase})
                      </span>
                      <span className="obs__item-meta">
                        base {entry.baseDuration}ms · {formatTime(entry.time)} ·{" "}
                        {entry.route || "/"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
