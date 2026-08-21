/**
 * A single parsed segment of note content.
 * - "text": plain text
 * - "media-url": an image or video URL
 * - "nostr": a bech32-encoded Nostr entity reference (npub, nprofile, note, nevent, naddr)
 */
export type ContentType =
  | { type: "text"; value: string }
  | { type: "media-url"; value: string }
  | { type: "nostr"; value: string };

const IMAGE_URL_REGEX =
  /https?:\/\/[^\s]+?\.(?:png|jpe?g|gif|webp|bmp|svg)(?:\?[^\s]*)?/gi;

const VIDEO_URL_REGEX =
  /(?:https?:\/\/[^\s]+?\.(?:mp4|webm|ogg)(?:\?[^\s]*)?|https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|vimeo\.com\/)[^\s]+)/gi;

const NOSTR_REF_REGEX =
  /nostr:(?:npub|nprofile|note|nevent|naddr)1[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+/gi;

const CONTENT_TOKEN_REGEX = new RegExp(
  `${IMAGE_URL_REGEX.source}|${VIDEO_URL_REGEX.source}|${NOSTR_REF_REGEX.source}`,
  "gi",
);

/**
 * Format a Unix timestamp (in seconds) to a human-readable relative time string.
 */
export function formatRelativeTime(timestamp: number | null | undefined): string {
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
export function truncateHex(
  hex: string | null | undefined,
  chars = 8,
): string | null | undefined {
  if (!hex || hex.length <= chars * 2 + 3) return hex;
  return `${hex.slice(0, chars)}...${hex.slice(-chars)}`;
}

/**
 * Extract image URLs from text content.
 * Finds http/https URLs ending in common image extensions.
 */
export function extractImageUrls(content: string | null | undefined): string[] {
  if (!content) return [];
  const matches = content.match(IMAGE_URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Extract video URLs from text content.
 * Supports direct video files (.mp4, .webm, .ogg) and YouTube/Vimeo links.
 */
export function extractVideoUrls(content: string | null | undefined): string[] {
  if (!content) return [];
  const matches = content.match(VIDEO_URL_REGEX);
  return matches ? [...new Set(matches)] : [];
}

/**
 * Split content into typed segments for rendering: plain text, media URLs,
 * and "nostr:" entity references.
 */
export function splitContent(content: string | null | undefined): ContentType[] {
  if (!content) return [];

  const parts: ContentType[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  CONTENT_TOKEN_REGEX.lastIndex = 0;
  while ((match = CONTENT_TOKEN_REGEX.exec(content)) !== null) {
    const value = match[0];
    if (match.index > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    parts.push({
      type: value.startsWith("nostr:") ? "nostr" : "media-url",
      value,
    });
    lastIndex = match.index + value.length;
  }
  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }
  return parts;
}

/**
 * Strip image and video URLs from content for display (plain-text preview).
 */
export function stripMediaUrls(content: string | null | undefined): string {
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

const KIND_LABELS: Record<number, string> = {
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

/**
 * Get the kind label for common Nostr event kinds.
 */
export function getKindLabel(kind: number | null | undefined): string {
  if (kind === null || kind === undefined) return `Kind ${kind}`;
  return KIND_LABELS[kind] || `Kind ${kind}`;
}
