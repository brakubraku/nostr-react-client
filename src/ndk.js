import NDK from "@nostr-dev-kit/ndk";

const DEFAULT_RELAYS = [
  "wss://relay.primal.net",
  "wss://nos.lol",
  "wss://relay.damus.io",
];

let ndkInstance = null;

/**
 * Get the global NDK instance. Creates one if it doesn't exist yet.
 *
 * @param {object} [options]
 * @param {string[]} [options.explicitRelayUrls] - Relay URLs to connect to.
 * @param {boolean} [options.aiGuardrails] - Enable AI guardrails (default: true).
 * @returns {NDK} The global NDK instance.
 */
export function getNDK(options = {}) {
  if (!ndkInstance) {
    ndkInstance = new NDK({
      explicitRelayUrls: options.explicitRelayUrls || DEFAULT_RELAYS,
      aiGuardrails: options.aiGuardrails ?? true,
    });
  }

  return ndkInstance;
}

/**
 * Connect the global NDK instance to its relays.
 * Safe to call multiple times; will not reconnect if already connected.
 *
 * @param {object} [options]
 * @param {number} [options.timeout] - Connection timeout in ms.
 * @returns {Promise<NDK>} Resolves with the connected NDK instance.
 */
export async function connectNDK(options = {}) {
  const ndk = getNDK(options);
  try {
    await ndk.connect(options.timeout);
  } catch (err) {
    console.error("Failed to connect global NDK:", err);
    throw err;
  }
  return ndk;
}

/**
 * Disconnect the global NDK instance (if any) from all relays.
 */
export function disconnectNDK() {
  if (ndkInstance) {
    // NDK doesn't have a built-in disconnect method in all versions,
    // so we try to close pools/explicit relays if available.
    try {
      // Some NDK versions expose pool or explicitRelaySet
      if (ndkInstance.pool) {
        ndkInstance.pool.close();
      }
    } catch {
      // ignore
    }
    ndkInstance = null;
  }
}
