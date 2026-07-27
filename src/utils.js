/**
 * Format a Unix timestamp (in seconds) to a human-readable relative time string.
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

/**
 * Truncate a long hex string (like a pubkey or event id) for display.
 */
export function truncateHex(hex, chars = 8) {
  if (!hex || hex.length <= chars * 2 + 3) return hex;
  return `${hex.slice(0, chars)}...${hex.slice(-chars)}`;
}

/**
 * Extract image URLs from text content.
 * Finds http/https URLs ending in common image extensions.
 */
export function extractImageUrls(content) {
  if (!content) return [];
  const imageRegex =
    /https?:\/\/[^\s]+?\.(?:png|jpe?g|gif|webp|bmp|svg)(?:\?[^\s]*)?/gi;
  const matches = content.match(imageRegex);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Extract video URLs from text content.
 * Supports direct video files (.mp4, .webm, .ogg) and YouTube/Vimeo links.
 */
export function extractVideoUrls(content) {
  if (!content) return [];
  const videoRegex =
    /(?:https?:\/\/[^\s]+?\.(?:mp4|webm|ogg)(?:\?[^\s]*)?|https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/)[^\s]+)/gi;
  const matches = content.match(videoRegex);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Strip image and video URLs from content for display.
 */
export function stripMediaUrls(content) {
  if (!content) return "";

  // Remove image URLs
  let result = content.replace(
    /https?:\/\/[^\s]+?\.(?:png|jpe?g|gif|webp|bmp|svg)(?:\?[^\s]*)?\s*/gi,
    "",
  );
  // Remove video URLs
  result = result.replace(
    /(?:https?:\/\/[^\s]+?\.(?:mp4|webm|ogg)(?:\?[^\s]*)?|https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/)[^\s]*)\s*/gi,
    "",
  );
  return result.trim();
}

/**
 * Get the kind label for common Nostr event kinds.
 */
export function getKindLabel(kind) {
  const labels = {
    0: "Metadata",
    1: "Text Note",
    3: "Contact List",
    4: "Encrypted DM",
    5: "Deletion",
    6: "Repost",
    7: "Reaction",
    8: "Badge Award",
    40: "Channel Creation",
    41: "Channel Metadata",
    42: "Channel Message",
    43: "Channel Hide",
    44: "Channel Mute",
    1063: "File Metadata",
    1984: "Reporting",
    9734: "Zap Request",
    9735: "Zap Receipt",
    10002: "Relay List Metadata",
    30023: "Long-form Content",
  };
  return labels[kind] || `Kind ${kind}`;
}