const STORAGE_KEY = "nostr-follows";

let follows = [];

// Observable subscribers
const subscribers = new Set();

/**
 * Load followed accounts from localStorage into memory.
 * Called once on module load to initialize the singleton.
 */
function loadFollows() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        follows = parsed;
      } else {
        console.warn("follows: stored data is not an array, resetting");
        follows = [];
      }
    }
  } catch (err) {
    console.error("follows: failed to load from localStorage", err);
    follows = [];
  }
}

function notifySubscribers() {
  const value = getFollows();
  for (const cb of subscribers) {
    cb(value);
  }
}

/**
 * Persist the current follows array to localStorage and notify subscribers
 * (observers registered via getFollows.subscribe).
 */
function saveFollows() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(follows));
    notifySubscribers();
  } catch (err) {
    console.error("follows: failed to save to localStorage", err);
  }
}

// Initialize on module load
loadFollows();

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Get the current list of followed account objects (a shallow copy).
 * This function is also an observable – subscribe to react to changes.
 *
 * @returns {Array<{pubkey: string, name?: string, displayName?: string, picture?: string, nip05?: string}>}
 */
export function getFollows() {
  return [...follows];
}

/**
 * Subscribe to changes to the follows list.
 * The callback receives the updated follows array each time a change occurs.
 * Returns an unsubscribe function.
 *
 * @param {(follows: Array) => void} callback
 * @returns {() => void} unsubscribe
 */
getFollows.subscribe = function (callback) {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
};

/**
 * Check if an account (by its pubkey) is already in the follows list.
 * @param {string} pubkey
 * @returns {boolean}
 */
export function isFollowing(pubkey) {
  return follows.some((follow) => follow.pubkey === pubkey);
}

/**
 * Add an account to follows. If already present, does nothing.
 * Persists to localStorage after change.
 * @param {{ pubkey: string, name?: string, displayName?: string, picture?: string, nip05?: string }} accountData
 * @returns {boolean} whether the account was added (true) or already existed / invalid (false)
 */
export function addFollow(accountData) {
  if (!accountData?.pubkey) return false;
  if (isFollowing(accountData.pubkey)) {
    return false;
  }
  follows.unshift(accountData);
  saveFollows();
  return true;
}

/**
 * Remove an account from follows by its pubkey. If not present, does nothing.
 * Persists to localStorage after change.
 * @param {string} pubkey
 * @returns {boolean} whether the account was removed (true) or not found (false)
 */
export function removeFollow(pubkey) {
  const index = follows.findIndex((follow) => follow.pubkey === pubkey);
  if (index === -1) {
    return false;
  }
  follows.splice(index, 1);
  saveFollows();
  return true;
}

/**
 * Toggle follow status for an account.
 * @param {{ pubkey: string, name?: string, displayName?: string, picture?: string, nip05?: string }} accountData
 * @returns {boolean} the new follow state (true = now followed, false = now not)
 */
export function toggleFollow(accountData) {
  if (!accountData?.pubkey) return false;
  if (isFollowing(accountData.pubkey)) {
    removeFollow(accountData.pubkey);
    return false;
  } else {
    addFollow(accountData);
    return true;
  }
}

/**
 * Remove all followed accounts.
 * Persists to localStorage after change.
 */
export function clearFollows() {
  if (follows.length === 0) return;
  follows = [];
  saveFollows();
}
