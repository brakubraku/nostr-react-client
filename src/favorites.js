const STORAGE_KEY = "nostr-favorites";

let favorites = [];

// Observable subscribers
const subscribers = new Set();

/**
 * Load favorites from localStorage into memory.
 * Called once on module load to initialize the singleton.
 */
function loadFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        favorites = parsed;
      } else {
        console.warn("favorites: stored data is not an array, resetting");
        favorites = [];
      }
    }
  } catch (err) {
    console.error("favorites: failed to load from localStorage", err);
    favorites = [];
  }
}

function notifySubscribers() {
  const value = getFavorites();
  for (const cb of subscribers) {
    cb(value);
  }
}

/**
 * Persist the current favorites array to localStorage and notify
 * subscribers (observers registered via getFavorites.subscribe).
 */
function saveFavorites() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    notifySubscribers();
  } catch (err) {
    console.error("favorites: failed to save to localStorage", err);
  }
}

// Initialize on module load
loadFavorites();

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Get the current list of favorite event objects (a shallow copy).
 * This function is also an observable – subscribe to react to changes.
 *
 * @returns {Array<{id: string, kind?: number, pubkey?: string, content?: string, created_at?: number, tags?: string[][]}>}
 */
export function getFavorites() {
  return [...favorites];
}

/**
 * Subscribe to changes to the favorites list.
 * The callback receives the updated favorites array each time a change occurs.
 * Returns an unsubscribe function.
 *
 * @param {(favorites: Array) => void} callback
 * @returns {() => void} unsubscribe
 */
getFavorites.subscribe = function (callback) {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
};
/**
 * Check if an event (by its id) is already in the favorites list.
 * @param {string} eventId
 * @returns {boolean}
 */
export function isFavorite(eventId) {
  return favorites.some((fav) => fav.id === eventId);
}

/**
 * Add an event to favorites. If already present, does nothing.
 * Persists to localStorage after change.
 * @param {{ id: string, kind?: number, pubkey?: string, content?: string, created_at?: number, tags?: string[][] }} eventData
 * @returns {boolean} whether the event was added (true) or already existed (false)
 */
export function addFavorite(eventData) {
  if (favorites.some((fav) => fav.id === eventData.id)) {
    return false;
  }
  favorites.unshift(eventData);
  saveFavorites();
  return true;
}

/**
 * Remove an event from favorites by its id. If not present, does nothing.
 * Persists to localStorage after change.
 * @param {string} eventId
 * @returns {boolean} whether the event was removed (true) or not found (false)
 */
export function removeFavorite(eventId) {
  const index = favorites.findIndex((fav) => fav.id === eventId);
  if (index === -1) {
    return false;
  }
  favorites.splice(index, 1);
  saveFavorites();
  return true;
}

/**
 * Toggle favorite status for an event.
 * @param {{ id: string, kind?: number, pubkey?: string, content?: string, created_at?: number, tags?: string[][] }} eventData
 * @returns {boolean} the new favorite state (true = now favorite, false = now not)
 */
export function toggleFavorite(eventData) {
  if (isFavorite(eventData.id)) {
    removeFavorite(eventData.id);
    return false;
  } else {
    addFavorite(eventData);
    return true;
  }
}

/**
 * Remove all favorites.
 * Persists to localStorage after change.
 */
export function clearFavorites() {
  if (favorites.length === 0) return;
  favorites = [];
  saveFavorites();
}
