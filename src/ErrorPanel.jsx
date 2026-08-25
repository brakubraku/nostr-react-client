import { useEffect, useState } from "react";
import { clearStoredErrors, getStoredErrors } from "./logger";
import "./ErrorPanel.css";

const POLL_INTERVAL_MS = 3000;
const MAX_VISIBLE = 20;

function formatTime(timestamp) {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return timestamp;
  }
}

/**
 * ErrorPanel - a fixed left-side panel that periodically reads thread fetch
 * errors written to localStorage by Thread.jsx and renders them as text.
 *
 * Polls localStorage on an interval so new errors show up without a reload.
 * Collapsible, with a "Clear" action that empties the stored log.
 */
export default function ErrorPanel() {
  const [errors, setErrors] = useState([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const load = () => {
      setErrors(getStoredErrors());
    };

    load();
    const id = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  const clearErrors = () => {
    clearStoredErrors();
    setErrors([]);
  };

  return (
    <aside
      className={`error-panel ${collapsed ? "error-panel--collapsed" : ""}`}
      aria-label="Thread fetch errors"
    >
      <div className="error-panel__header">
        <h2 className="error-panel__title">
          ⚠ Fetch Errors{errors.length > 0 ? ` (${errors.length})` : ""}
        </h2>
        <div className="error-panel__actions">
          {errors.length > 0 && (
            <button
              type="button"
              className="error-panel__btn"
              onClick={clearErrors}
            >
              Clear
            </button>
          )}
          <button
            type="button"
            className="error-panel__btn"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label={
              collapsed ? "Expand error panel" : "Collapse error panel"
            }
            aria-expanded={!collapsed}
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>
      </div>
      {!collapsed && (
        <div className="error-panel__body">
          {errors.length === 0 ? (
            <p className="error-panel__empty">No errors recorded.</p>
          ) : (
            <ul className="error-panel__list">
              {errors
                .slice(-MAX_VISIBLE)
                .reverse()
                .map((err, index) => (
                  <li
                    key={`${err.time}-${index}`}
                    className="error-panel__item"
                  >
                    <div className="error-panel__item-time">
                      {formatTime(err.time)}
                    </div>
                    {err.eventId && (
                      <div className="error-panel__item-event">
                        event: {err.eventId}
                      </div>
                    )}
                    <div className="error-panel__item-message">
                      {err.message}
                    </div>
                    {err.stack && (
                      <pre className="error-panel__item-stack">{err.stack}</pre>
                    )}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
