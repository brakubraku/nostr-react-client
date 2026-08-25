// Central logger for the app. Wraps console with level gating and persists
// error entries to localStorage so the ErrorPanel can display them.

export const ERROR_STORAGE_KEY = "nostr-thread-fetch-error";
export const MAX_STORED_ERRORS = 50;

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const MODE = import.meta.env && import.meta.env.MODE;
const threshold = MODE === "production" ? LEVELS.info : LEVELS.debug;

function shouldLog(level) {
  return LEVELS[level] >= threshold;
}

function writeConsole(level, message, context) {
  if (!shouldLog(level)) return;
  if (context === undefined) console[level](message);
  else console[level](message, context);
}

/**
 * Append an entry to the persisted error log (used by ErrorPanel).
 *
 * The entry is shaped as { time, ...context, message }. Fields passed via
 * `context` (e.g. message, eventId, stack) take precedence over the
 * `message` argument, so callers can supply rich details for the panel.
 */
function persistError(message, context = {}) {
  try {
    const log = JSON.parse(localStorage.getItem(ERROR_STORAGE_KEY) || "[]");
    log.push({ time: new Date().toISOString(), message, ...context });
    localStorage.setItem(
      ERROR_STORAGE_KEY,
      JSON.stringify(log.slice(-MAX_STORED_ERRORS)),
    );
  } catch (err) {
    console.error("Failed to store error in localStorage:", err);
  }
}

export const logger = {
  debug(message, context) {
    writeConsole("debug", message, context);
  },
  info(message, context) {
    writeConsole("info", message, context);
  },
  warn(message, context) {
    writeConsole("warn", message, context);
  },
  /**
   * Log to console and persist to localStorage for the ErrorPanel.
   * @param {string} message Human-readable description of the failure.
   * @param {object} [context] Extra fields (eventId, message, stack, ...).
   */
  error(message, context) {
    writeConsole("error", message, context);
    persistError(message, context);
  },
};

/** Read the persisted error log (newest-last), or [] if none. */
export function getStoredErrors() {
  try {
    const raw = localStorage.getItem(ERROR_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to read errors from localStorage:", err);
    return [];
  }
}

/** Clear the persisted error log. */
export function clearStoredErrors() {
  try {
    localStorage.removeItem(ERROR_STORAGE_KEY);
  } catch (err) {
    console.error("Failed to clear errors in localStorage:", err);
  }
}
