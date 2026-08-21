import { describe, it, expect } from "vitest";
import {
  extractImageUrls,
  extractVideoUrls,
  stripMediaUrls,
  splitContent,
  getKindLabel,
  truncateHex,
} from "../utils";

describe("Utility functions", () => {
  describe("extractImageUrls", () => {
    it("should return empty array for empty content", () => {
      expect(extractImageUrls("")).toEqual([]);
      expect(extractImageUrls(null)).toEqual([]);
      expect(extractImageUrls(undefined)).toEqual([]);
    });

    it("should extract PNG URLs", () => {
      const result = extractImageUrls("Check https://example.com/img.png");
      expect(result).toEqual(["https://example.com/img.png"]);
    });

    it("should extract JPEG URLs", () => {
      const result = extractImageUrls("Photo: https://example.com/photo.jpg");
      expect(result).toEqual(["https://example.com/photo.jpg"]);
    });

    it("should not xtract various image extensions", () => {
      const content = "a.png b.jpeg c.gif d.webp e.bmp f.svg";
      const result = extractImageUrls(content);
      expect(result).toEqual([]);
    });

    it("should handle URLs with query parameters", () => {
      const result = extractImageUrls(
        "https://example.com/img.png?w=800&h=600",
      );
      expect(result).toEqual(["https://example.com/img.png?w=800&h=600"]);
    });

    it("should return unique URLs only", () => {
      const result = extractImageUrls(
        "https://example.com/img.png https://example.com/img.png",
      );
      expect(result).toHaveLength(1);
    });
  });

  describe("extractVideoUrls", () => {
    it("should return empty array for empty content", () => {
      expect(extractVideoUrls("")).toEqual([]);
    });

    it("should extract MP4 URLs", () => {
      const result = extractVideoUrls("https://example.com/video.mp4");
      expect(result).toEqual(["https://example.com/video.mp4"]);
    });

    it("should extract WebM URLs", () => {
      const result = extractVideoUrls("https://example.com/video.webm");
      expect(result).toEqual(["https://example.com/video.webm"]);
    });

    it("should extract YouTube URLs", () => {
      const result = extractVideoUrls(
        "https://youtube.com/watch?v=dQw4w9WgXcQ",
      );
      expect(result).toEqual(["https://youtube.com/watch?v=dQw4w9WgXcQ"]);
    });

    it("should extract youtu.be URLs", () => {
      const result = extractVideoUrls("https://youtu.be/dQw4w9WgXcQ");
      expect(result).toEqual(["https://youtu.be/dQw4w9WgXcQ"]);
    });

    it("should extract Vimeo URLs", () => {
      const result = extractVideoUrls("https://vimeo.com/12345678");
      expect(result).toEqual(["https://vimeo.com/12345678"]);
    });
  });

  describe("stripMediaUrls", () => {
    it("should return empty string for falsy content", () => {
      expect(stripMediaUrls("")).toBe("");
      expect(stripMediaUrls(null)).toBe("");
      expect(stripMediaUrls(undefined)).toBe("");
    });

    it("should remove image URLs from content", () => {
      const result = stripMediaUrls("Hello https://example.com/img.png world");
      expect(result).toBe("Hello world");
    });

    it("should remove video URLs from content", () => {
      const result = stripMediaUrls("Check https://example.com/video.mp4 this");
      expect(result).toBe("Check this");
    });

    it("should remove both image and video URLs", () => {
      const result = stripMediaUrls(
        "https://example.com/img.png text https://example.com/video.mp4 more",
      );
      expect(result).toBe("text more");
    });

    it("should keep non-media URLs intact", () => {
      const result = stripMediaUrls("Visit https://example.com for more info");
      expect(result).toBe("Visit https://example.com for more info");
    });
  });

  describe("getKindLabel", () => {
    it("should return 'Text Note' for kind 1", () => {
      expect(getKindLabel(1)).toBe("Text Note");
    });

    it("should return 'Metadata' for kind 0", () => {
      expect(getKindLabel(0)).toBe("Metadata");
    });

    it("should return fallback for unknown kinds", () => {
      expect(getKindLabel(999)).toBe("Kind 999");
    });

    it("should return 'Reaction' for kind 7", () => {
      expect(getKindLabel(7)).toBe("Reaction");
    });

    it("should return labels for all known kinds", () => {
      expect(getKindLabel(3)).toBe("Contact List");
      expect(getKindLabel(4)).toBe("Encrypted DM");
      expect(getKindLabel(5)).toBe("Deletion");
      expect(getKindLabel(6)).toBe("Repost");
      expect(getKindLabel(8)).toBe("Badge Award");
      expect(getKindLabel(40)).toBe("Channel Creation");
      expect(getKindLabel(41)).toBe("Channel Metadata");
      expect(getKindLabel(42)).toBe("Channel Message");
      expect(getKindLabel(43)).toBe("Channel Hide");
      expect(getKindLabel(44)).toBe("Channel Mute");
      expect(getKindLabel(1063)).toBe("File Metadata");
      expect(getKindLabel(1984)).toBe("Reporting");
      expect(getKindLabel(9734)).toBe("Zap Request");
      expect(getKindLabel(9735)).toBe("Zap Receipt");
      expect(getKindLabel(10002)).toBe("Relay List Metadata");
      expect(getKindLabel(30023)).toBe("Long-form Content");
    });
  });

  describe("truncateHex", () => {
    it("should return falsy values as-is", () => {
      expect(truncateHex(null)).toBeNull();
      expect(truncateHex("")).toBe("");
      expect(truncateHex(undefined)).toBeUndefined();
    });

    it("should not truncate short strings", () => {
      const short = "abc123";
      expect(truncateHex(short)).toBe(short);
    });

    it("should truncate long hex strings", () => {
      const longHex = "abcdef0123456789abcdef0123456789";
      const result = truncateHex(longHex);
      expect(result).toBe("abcdef01...23456789");
    });

    it("should use custom number of chars", () => {
      const longHex = "abcdef0123456789abcdef0123456789";
      const result = truncateHex(longHex, 4);
      expect(result).toBe("abcd...6789");
    });
  });


  describe("splitContent", () => {
    it("should return empty array for empty content", () => {
      expect(splitContent("")).toEqual([]);
      expect(splitContent(null)).toEqual([]);
      expect(splitContent(undefined)).toEqual([]);
    });

    it("should return a single text part for plain content", () => {
      expect(splitContent("hello world")).toEqual([
        { type: "text", value: "hello world" },
      ]);
    });

    it("should split text and image URLs into typed parts", () => {
      const result = splitContent("Look https://example.com/a.png here");
      expect(result).toEqual([
        { type: "text", value: "Look " },
        { type: "media-url", value: "https://example.com/a.png" },
        { type: "text", value: " here" },
      ]);
    });

    it("should split video URLs into media-url parts", () => {
      const result = splitContent("https://youtu.be/dQw4w9WgXcQ wow");
      expect(result).toEqual([
        { type: "media-url", value: "https://youtu.be/dQw4w9WgXcQ" },
        { type: "text", value: " wow" },
      ]);
    });

    it("should split nostr entity references into nostr parts", () => {
      const npub =
        "nostr:npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
      const result = splitContent(`hi ${npub} bye`);
      expect(result).toEqual([
        { type: "text", value: "hi " },
        { type: "nostr", value: npub },
        { type: "text", value: " bye" },
      ]);
    });

    it("should handle media URLs and nostr refs together", () => {
      const npub =
        "nostr:npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
      const result = splitContent(`${npub} https://example.com/i.gif text`);
      expect(result).toEqual([
        { type: "nostr", value: npub },
        { type: "text", value: " " },
        { type: "media-url", value: "https://example.com/i.gif" },
        { type: "text", value: " text" },
      ]);
    });

    it("should keep non-media URLs as text", () => {
      const result = splitContent("Visit https://example.com for info");
      expect(result).toEqual([
        { type: "text", value: "Visit https://example.com for info" },
      ]);
    });
  });
});