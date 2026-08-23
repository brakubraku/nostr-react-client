/**
 * In-browser observability for CPU and memory spikes.
 *
 * What it tracks:
 * - CPU spikes: Long Task API entries (Chromium/Firefox) plus an event-loop
 *   lag monitor as a fallback, and React render timings via <Profiler>.
 * - Memory spikes: sampled JS heap size (Chromium's `performance.memory`,
 *   which Firefox/Safari do not expose) with jump and sustained-growth
 *   detection, plus a per-context breakdown when
 *   `performance.measureUserAgentSpecificMemory()` is available (it requires
 *   cross-origin isolation, which this app does not enable, so it is skipped
 *   when unavailable). App-level retained-memory gauges (feed events, NSFW
 *   cache, mounted media) work in every browser.
 * - Custom traces: call sites wrapped with trace()/traceSync(), e.g. NSFW
 *   model load/classify, image decode, and feed event ingestion.
 *
 * Events land in a small in-memory buffer (for the dev overlay), are logged
 * to the console, and can be batched to an endpoint via navigator.sendBeacon.
 * The module is inert until initObservability() is called and is a no-op
 * outside the browser or when disabled, so it is safe to import anywhere.
 *
 * Configuration (merged with window.__OBSERVABILITY_CONFIG__ and query
 * params; query params win):
 *   enabled          - true/false (default: import.meta.env.DEV)
 *   overlay          - show the in-app dev overlay (default: true)
 *   console          - log spikes to the console (default: true)
 *   beaconUrl        - POST URL for batched events (default: "")
 *   longTaskThresholdMs - min duration for a long task to count (100)
 *   traceSpikeMs     - traces at/over this duration become spikes (200)
 *   renderSpikeMs    - React renders at/over this duration become spikes (50)
 *   lagThresholdMs   - event-loop lag that counts as a spike (500)
 *   lagIntervalMs    - event-loop lag sampling interval (250)
 *   memorySampleMs   - JS heap sampling interval (2000)
 *   heapJumpMB       - heap jump between samples that counts as a spike (40)
 *   sustainedGrowthMB / sustainedGrowthWindowMs - slow-growth spike (100/60000)
 *   breakdownSampleMs - measureUserAgentSpecificMemory interval (60000)
 *   maxBuffer        - ring buffer size per category (100)
 *   beaconFlushMs    - how often the outbox is flushed (5000)
 *   beaconMinTraceMs - only send traces at/over this duration (100)
 *
 * Query params:
 *   ?observe=1|0    - force enable/disable
 *   ?telemetry=URL  - set the beacon URL (e.g. ?telemetry=https://host/ingest)
 */

const MB = 1024 * 1024;

const DEFAULTS = Object.freeze({
  enabled: import.meta.env.DEV === true,
  overlay: true,
  console: true,
  beaconUrl: "",
  longTaskThresholdMs: 100,
  traceSpikeMs: 200,
  renderSpikeMs: 50,
  lagThresholdMs: 500,
  lagIntervalMs: 250,
  memorySampleMs: 2000,
  heapJumpMB: 40,
  sustainedGrowthMB: 100,
  sustainedGrowthWindowMs: 60_000,
  breakdownSampleMs: 60_000,
  maxBuffer: 100,
  beaconFlushMs: 5_000,
  beaconMinTraceMs: 100,
});

const state = {
  initialized: false,
  enabled: false,
  config: { ...DEFAULTS },
  longTasks: [],
  memorySamples: [],
  spikes: [],
  traces: [],
  renders: [],
  heap: { usedMB: 0, totalMB: 0, peakMB: 0, breakdown: null },
  gauges: { "feed.events": 0, "nsfw.cache": 0, "media.elements": 0 },
  lagMs: 0,
  counters: { spikes: 0, longTasks: 0, traces: 0, renders: 0, memorySamples: 0 },
};

const listeners = new Set();
const outbox = [];
let flushTimer = null;
let emitTimer = null;
let lastMemorySample = null;
let lastSustainedReportAt = 0;
let lagExpectedAt = 0;
let lastEmittedLag = 0;
let memoryApi = null;
let heapNoteLogged = false;
let mediaCountTimer = null;

function currentRoute() {
  return typeof window !== "undefined" ? window.location.pathname : "";
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Synchronous heap size in MB, or null when the browser has no synchronous
 * heap API (Firefox/Safari lack performance.memory; the UAS breakdown API is
 * async and needs cross-origin isolation). Trace-level heap deltas are only
 * available in Chromium.
 */
function heapUsedMB() {
  if (memoryApi !== "performance.memory") return null;
  const memory = performance.memory;
  return memory?.usedJSHeapSize ? memory.usedJSHeapSize / MB : 0;
}

function pushLimited(array, item, max) {
  array.push(item);
  if (array.length > max) array.splice(0, array.length - max);
}

function resolveConfig(overrides) {
  const fromWindow =
    typeof window !== "undefined" ? window.__OBSERVABILITY_CONFIG__ : null;
  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const config = { ...DEFAULTS, ...fromWindow, ...overrides };

  const telemetry = params.get("telemetry");
  if (telemetry) config.beaconUrl = telemetry;

  const observe = params.get("observe");
  if (observe === "1") config.enabled = true;
  if (observe === "0") config.enabled = false;

  return config;
}

/**
 * Start observing. Safe to call more than once; returns true when the
 * observability layer is active.
 */
export function initObservability(overrides) {
  if (state.initialized) return state.enabled;
  if (typeof window === "undefined" || typeof performance === "undefined") {
    return false;
  }

  state.config = resolveConfig(overrides);
  state.enabled = state.config.enabled;
  if (!state.enabled) return false;

  state.initialized = true;
  startLongTaskObserver();
  startLagMonitor();
  startMemorySampler();
  startMediaMonitor();

  window.addEventListener("pagehide", flushBeacon);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushBeacon();
  });

  return true;
}

export function isObservabilityEnabled() {
  return state.enabled && state.initialized;
}

/** True when the in-app overlay should be rendered. */
export function shouldShowOverlay() {
  return isObservabilityEnabled() && state.config.overlay;
}

/** Subscribe to snapshot updates. Returns an unsubscribe function. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Current snapshot of every buffer and gauge, for the overlay and exports. */
export function getSnapshot() {
  return {
    enabled: state.enabled,
    initialized: state.initialized,
    config: { ...state.config },
    heap: { ...state.heap },
    memory: {
      api: memoryApi ?? "unsupported",
      supported: memoryApi !== null,
      note: memoryApi
        ? ""
        : "This browser has no JS heap API (performance.memory is Chromium-only; measureUserAgentSpecificMemory needs cross-origin isolation). Open in Chrome/Edge for heap metrics; app-level gauges below still work.",
    },
    gauges: { ...state.gauges },
    lagMs: state.lagMs,
    counters: { ...state.counters },
    longTasks: [...state.longTasks].reverse(),
    memorySamples: [...state.memorySamples],
    spikes: [...state.spikes].reverse(),
    traces: [...state.traces].reverse(),
    renders: [...state.renders].reverse(),
  };
}

/** Reset the in-memory buffers (gauge values and peak are kept). */
export function clearObservability() {
  state.longTasks.length = 0;
  state.memorySamples.length = 0;
  state.spikes.length = 0;
  state.traces.length = 0;
  state.renders.length = 0;
  state.counters = {
    spikes: 0,
    longTasks: 0,
    traces: 0,
    renders: 0,
    memorySamples: 0,
  };
  emit();
}

/**
 * Track an app-level retained-memory proxy (feed event count, NSFW cache
 * size, mounted media elements). These work in every browser and help find
 * memory growth when the JS heap API is unavailable.
 */
export function setGauge(name, value) {
  if (!state.initialized || !(name in state.gauges)) return;
  state.gauges[name] = value;
  emit();
}

/**
 * Time an async operation. Records duration and heap delta; long/heavy
 * operations also produce a spike event. The function runs normally when
 * observability is not initialized.
 */
export async function trace(name, fn) {
  if (!state.initialized) return fn();
  const start = performance.now();
  const beforeMB = heapUsedMB();
  try {
    return await fn();
  } finally {
    const afterMB = heapUsedMB();
    recordTrace(
      name,
      performance.now() - start,
      beforeMB === null || afterMB === null ? null : afterMB - beforeMB,
    );
  }
}

/** Synchronous variant of trace() for CPU-bound work. */
export function traceSync(name, fn) {
  if (!state.initialized) return fn();
  const start = performance.now();
  const beforeMB = heapUsedMB();
  try {
    return fn();
  } finally {
    const afterMB = heapUsedMB();
    recordTrace(
      name,
      performance.now() - start,
      beforeMB === null || afterMB === null ? null : afterMB - beforeMB,
    );
  }
}

/**
 * React <Profiler> onRender callback. Render times at/over renderSpikeMs
 * become spikes; renders at/over 16ms are still sent to the beacon.
 */
export function reportRender(
  id,
  phase,
  actualDuration,
  baseDuration,
  startTime,
) {
  if (!state.initialized) return;
  const event = {
    kind: "render",
    id,
    phase,
    actualDuration: round1(actualDuration),
    baseDuration: round1(baseDuration),
    startTime: round1(startTime),
    time: Date.now(),
    route: currentRoute(),
  };

  // StrictMode double-invokes renders in dev; keep the slower measurement.
  const existing = state.renders.find(
    (entry) => entry.id === id && entry.startTime === event.startTime,
  );
  if (existing) {
    if (event.actualDuration > existing.actualDuration) {
      existing.actualDuration = event.actualDuration;
    }
    return;
  }

  pushLimited(state.renders, event, state.config.maxBuffer);
  state.counters.renders += 1;

  if (actualDuration >= state.config.renderSpikeMs) {
    reportSpike({
      type: "render-slow",
      id,
      phase,
      actualDuration: event.actualDuration,
      thresholdMs: state.config.renderSpikeMs,
    });
  } else if (actualDuration >= 16) {
    enqueue(event);
  }
  emit();
}

function recordTrace(name, durationMs, heapDeltaMB) {
  const event = {
    kind: "trace",
    name,
    durationMs: round1(durationMs),
    heapDeltaMB: heapDeltaMB === null ? null : round1(heapDeltaMB),
    time: Date.now(),
    route: currentRoute(),
  };
  pushLimited(state.traces, event, state.config.maxBuffer);
  state.counters.traces += 1;

  const heapSpike =
    event.heapDeltaMB !== null && event.heapDeltaMB >= state.config.heapJumpMB;
  if (durationMs >= state.config.traceSpikeMs || heapSpike) {
    reportSpike({
      type: "trace",
      name,
      durationMs: event.durationMs,
      heapDeltaMB: event.heapDeltaMB,
      thresholdMs: state.config.traceSpikeMs,
    });
  } else if (durationMs >= state.config.beaconMinTraceMs) {
    enqueue(event);
  }
  emit();
}

function startLongTaskObserver() {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < state.config.longTaskThresholdMs) continue;
        const attribution = entry.attribution?.[0] ?? null;
        const event = {
          kind: "longtask",
          durationMs: round1(entry.duration),
          startTime: round1(entry.startTime),
          attribution: attribution
            ? {
                name: attribution.name ?? null,
                containerType: attribution.containerType ?? null,
                containerSrc:
                  attribution.containerSrc ?? attribution.scriptURL ?? null,
                containerName: attribution.containerName ?? null,
                containerId: attribution.containerId ?? null,
              }
            : null,
          time: Date.now(),
          route: currentRoute(),
        };
        pushLimited(state.longTasks, event, state.config.maxBuffer);
        state.counters.longTasks += 1;
        reportSpike({
          type: "cpu-long-task",
          durationMs: event.durationMs,
          startTime: event.startTime,
          attribution: event.attribution,
          thresholdMs: state.config.longTaskThresholdMs,
        });
      }
    });
    observer.observe({ entryTypes: ["longtask"] });
  } catch {
    // Long Task API unavailable (e.g. older Safari); the lag monitor covers us.
  }
}

function startLagMonitor() {
  lagExpectedAt = performance.now() + state.config.lagIntervalMs;
  setInterval(() => {
    const now = performance.now();
    const lagMs = Math.max(0, now - lagExpectedAt);
    lagExpectedAt = now + state.config.lagIntervalMs;
    state.lagMs = lagMs;

    if (lagMs > state.config.lagThresholdMs) {
      reportSpike({
        type: "cpu-event-loop-lag",
        lagMs: round1(lagMs),
        thresholdMs: state.config.lagThresholdMs,
      });
    } else if (Math.abs(lagMs - lastEmittedLag) >= 5) {
      lastEmittedLag = lagMs;
      emit();
    }
  }, state.config.lagIntervalMs);
}

function detectMemoryApi() {
  if (typeof performance === "undefined") return null;
  if (performance.memory) return "performance.memory";
  if (typeof performance.measureUserAgentSpecificMemory === "function") {
    return "measureUserAgentSpecificMemory";
  }
  return null;
}

function startMemorySampler() {
  memoryApi = detectMemoryApi();
  if (!memoryApi) {
    if (state.config.console && !heapNoteLogged) {
      heapNoteLogged = true;
      console.warn(
        "[observability] JS heap metrics unavailable in this browser " +
          "(performance.memory is Chromium-only; measureUserAgentSpecificMemory " +
          "needs cross-origin isolation). Heap gauges stay 0; app-level memory " +
          "gauges and CPU tracking still work.",
      );
    }
    emit();
    return;
  }
  sampleMemory();
  setInterval(sampleMemory, state.config.memorySampleMs);
}

async function sampleMemory() {
  let usedBytes = 0;
  let totalBytes = 0;

  if (memoryApi === "performance.memory") {
    const memory = performance.memory;
    if (!memory) return;
    usedBytes = memory.usedJSHeapSize;
    totalBytes = memory.totalJSHeapSize;
  } else if (memoryApi === "measureUserAgentSpecificMemory") {
    try {
      const result = await performance.measureUserAgentSpecificMemory();
      usedBytes = result.bytes;
      totalBytes = result.bytes;
      state.heap.breakdown = result.breakdown ?? [];
    } catch {
      // Requires cross-origin isolation (COOP/COEP headers); not available.
      if (state.config.console && !heapNoteLogged) {
        heapNoteLogged = true;
        console.warn(
          "[observability] measureUserAgentSpecificMemory() requires " +
            "cross-origin isolation (COOP/COEP headers); disabling heap sampling.",
        );
      }
      memoryApi = null;
      return;
    }
  } else {
    return;
  }

  const usedMB = usedBytes / MB;
  const totalMB = totalBytes / MB;
  const sample = {
    kind: "memory-sample",
    time: Date.now(),
    usedMB: round1(usedMB),
    totalMB: round1(totalMB),
  };
  pushLimited(state.memorySamples, sample, Math.max(state.config.maxBuffer, 120));
  state.counters.memorySamples += 1;
  state.heap.usedMB = sample.usedMB;
  state.heap.totalMB = sample.totalMB;
  state.heap.peakMB = Math.max(state.heap.peakMB, sample.usedMB);

  if (lastMemorySample) {
    const jumpMB = sample.usedMB - lastMemorySample.usedMB;
    if (jumpMB >= state.config.heapJumpMB) {
      reportSpike({
        type: "memory-jump",
        jumpMB: round1(jumpMB),
        fromMB: lastMemorySample.usedMB,
        usedMB: sample.usedMB,
        totalMB: sample.totalMB,
      });
    }
  }
  lastMemorySample = sample;

  const now = Date.now();
  if (now - lastSustainedReportAt >= state.config.sustainedGrowthWindowMs) {
    const windowStart = now - state.config.sustainedGrowthWindowMs;
    const oldest = state.memorySamples.find((entry) => entry.time >= windowStart);
    if (oldest && sample.usedMB - oldest.usedMB >= state.config.sustainedGrowthMB) {
      lastSustainedReportAt = now;
      reportSpike({
        type: "memory-sustained-growth",
        growthMB: round1(sample.usedMB - oldest.usedMB),
        usedMB: sample.usedMB,
        windowMs: state.config.sustainedGrowthWindowMs,
      });
    }
  }

  emit();
}

/**
 * Count mounted <img>/<video> elements as a retained-memory proxy. Decoded
 * image/video bitmaps are usually the biggest memory driver in the feed, and
 * this works in every browser (unlike the JS heap APIs).
 */
function startMediaMonitor() {
  if (
    typeof MutationObserver === "undefined" ||
    typeof document === "undefined"
  ) {
    return;
  }
  const update = () => {
    const count = document.querySelectorAll("img, video").length;
    if (count !== state.gauges["media.elements"]) {
      state.gauges["media.elements"] = count;
      emit();
    }
  };
  const observer = new MutationObserver(() => {
    if (mediaCountTimer) return;
    mediaCountTimer = setTimeout(() => {
      mediaCountTimer = null;
      update();
    }, 300);
  });
  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
  update();
}

function reportSpike(event) {
  const spike = {
    kind: "spike",
    time: Date.now(),
    route: currentRoute(),
    ...event,
  };
  pushLimited(state.spikes, spike, state.config.maxBuffer);
  state.counters.spikes += 1;
  if (state.config.console) {
    console.warn(`[observability] spike: ${spike.type}`, spike);
  }
  enqueue(spike);
  emit();
}

function enqueue(event) {
  if (!state.config.beaconUrl) return;
  outbox.push(event);
  if (!flushTimer) flushTimer = setTimeout(flushBeacon, state.config.beaconFlushMs);
  if (outbox.length >= 20) flushBeacon();
}

function flushBeacon() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!state.config.beaconUrl || outbox.length === 0) return;

  const batch = outbox.splice(0, outbox.length);
  const body = JSON.stringify({
    app: "nostr-events",
    version: 1,
    sentAt: new Date().toISOString(),
    events: batch,
  });

  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(state.config.beaconUrl, body);
    } else {
      fetch(state.config.beaconUrl, {
        method: "POST",
        body,
        keepalive: true,
        headers: { "Content-Type": "application/json" },
      }).catch(() => {});
    }
  } catch {
    // Beacons are best-effort; ignore failures.
  }
}

// Coalesce UI updates so a burst of traces/samples doesn't re-render the
// overlay more than ~10 times per second.
function emit() {
  if (emitTimer) return;
  emitTimer = setTimeout(() => {
    emitTimer = null;
    const snapshot = getSnapshot();
    for (const listener of listeners) {
      try {
        listener(snapshot);
      } catch {
        // A subscriber must never break the observability loop.
      }
    }
  }, 100);
}
