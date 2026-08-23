# Clanker driven development

Deepseek v4 Flash token costs to build it so far: 0.83$

# Run with

Should be running after devcontainer starts, otherwise:

npx vite --host 0.0.0.0 --port 5173

## Observability

The app ships with a built-in observability layer for finding CPU and memory
spikes in the browser (see `src/observability.js`). It is active automatically
in dev (`npm run dev`) and can be enabled in any environment with
`?observe=1` in the URL.

What it tracks:

- CPU: Long Task API entries (main-thread blocks with script attribution),
  event-loop lag as a fallback, and React render timings via `<Profiler>`.
- Memory: sampled JS heap size (`performance.memory`, Chromium) with jump and
  sustained-growth spike detection, plus a per-context breakdown when
  `measureUserAgentSpecificMemory()` is available. Firefox/Safari have no heap
  API, so the panel shows "n/a" there and app-level memory gauges instead:
  feed event count, NSFW cache entries, and mounted media elements.
- Traces: NSFW model load/classify, image decode, and feed event ingestion are
  timed, with heap deltas where the browser supports them.

How to use it:

1. Open the app in dev. A floating 📊 button appears bottom-right; click it or
   press Ctrl/Cmd+Shift+O to open the panel. It shows live spikes, long-task
   attribution, a heap sparkline, traces, and slow renders. "Copy" exports the
   full snapshot as JSON.
2. Spikes are also logged to the console as `[observability] spike:`.
3. To send events to your own collector, either set
   `window.__OBSERVABILITY_CONFIG__ = { beaconUrl: "https://your-host/ingest" }`
   before the bundle loads, or append `?telemetry=https://your-host/ingest`.
   Events are batched and sent with `navigator.sendBeacon`.

Configuration is merged from `window.__OBSERVABILITY_CONFIG__`, URL params, and
the defaults documented at the top of `src/observability.js`.
