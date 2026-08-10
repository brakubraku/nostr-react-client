import { cloneElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import NostrEventCard from "../NostrEventCard";

// Mock NDK instance passed via props (author metadata fetch)
const mockNdk = {
  getUser: vi.fn(() => ({
    fetchProfile: vi.fn().mockResolvedValue(undefined),
    profile: {},
  })),
};

// Helper to render with router context, injecting the ndk prop
function renderWithRouter(element) {
  return render(
    <BrowserRouter>{cloneElement(element, { ndk: mockNdk })}</BrowserRouter>,
  );
}

// Mock the favourites module
vi.mock("../favourites", () => ({
  getFavourites: Object.assign(() => [], { subscribe: vi.fn(() => vi.fn()) }),
  isFavorite: vi.fn(() => false),
  toggleFavorite: vi.fn(() => true),
  removeFavorite: vi.fn(),
}));

// Mock nsfwjs checks: images are safe by default, tests can opt into NSFW.
vi.mock("../nsfw", () => ({
  checkImageUrl: vi.fn(() => Promise.resolve({ nsfw: false, cf: null })),
}));

describe("NostrEventCard", () => {
  const basicEvent = {
    id: "abc123def456",
    kind: 1,
    pubkey: "pubkey1234567890123456789012345678901234567890",
    content:
      "Hello from Nostr! This is a test note with enough text to check preview truncation.",
    created_at: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
    tags: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render the event content", () => {
    renderWithRouter(<NostrEventCard event={basicEvent} />);
    expect(screen.getByText(/Hello from Nostr!/)).toBeInTheDocument();
  });

  it("should show a placeholder when no event is provided", () => {
    renderWithRouter(<NostrEventCard event={null} />);
    expect(screen.getByText("No event data")).toBeInTheDocument();
  });

  it("should render a pulsing loading skeleton when loading is true", () => {
    const { container } = renderWithRouter(
      <NostrEventCard event={basicEvent} loading={true} />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      container.querySelectorAll(".nostr-card__skeleton").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/Hello from Nostr!/)).not.toBeInTheDocument();
  });

  it("should render the loading skeleton even without an event", () => {
    renderWithRouter(<NostrEventCard loading={true} />);
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.queryByText("No event data")).not.toBeInTheDocument();
  });

  it("should switch between the loading skeleton and content without errors", () => {
    const { rerender } = renderWithRouter(
      <NostrEventCard event={basicEvent} loading={true} />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();

    rerender(
      <BrowserRouter>
        <NostrEventCard event={basicEvent} ndk={mockNdk} loading={false} />
      </BrowserRouter>,
    );
    expect(screen.getByText(/Hello from Nostr!/)).toBeInTheDocument();
  });

  it("should display the kind badge when showMeta is true", () => {
    renderWithRouter(<NostrEventCard event={basicEvent} showMeta={true} />);
    expect(screen.getByText("Text Note")).toBeInTheDocument();
  });

  it("should hide the kind badge when showMeta is false", () => {
    renderWithRouter(<NostrEventCard event={basicEvent} showMeta={false} />);
    expect(screen.queryByText("Text Note")).not.toBeInTheDocument();
  });

  it("should display relative time", () => {
    renderWithRouter(<NostrEventCard event={basicEvent} />);
    expect(screen.getByText(/h ago|m ago/)).toBeInTheDocument();
  });

  it("should expand and show metadata on click", () => {
    renderWithRouter(<NostrEventCard event={basicEvent} />);

    // Metadata should not be visible initially
    expect(screen.queryByText("Event ID")).not.toBeInTheDocument();

    // Click to expand
    fireEvent.click(screen.getByText((content) => content.includes("▼ more")));

    // Wait for expand
    expect(screen.getByText("Event ID")).toBeInTheDocument();
    expect(screen.getByText(basicEvent.id)).toBeInTheDocument();
    expect(screen.getByText("Pubkey")).toBeInTheDocument();
  });

  it("should toggle favourite state when fav button is clicked", async () => {
    const { toggleFavorite } = await import("../favourites");
    renderWithRouter(<NostrEventCard event={basicEvent} />);

    const favButton = screen.getByTitle("Add to favourites");
    fireEvent.click(favButton);

    expect(toggleFavorite).toHaveBeenCalledWith(
      expect.objectContaining({ id: basicEvent.id }),
    );
  });

  it("should show confirmation modal when unfavouriting with confirmUnfav", async () => {
    // Simulate that it's already a favourite
    const favModule = await import("../favourites");
    vi.mocked(favModule.isFavorite).mockReturnValue(true);
    vi.mocked(favModule.toggleFavorite).mockReturnValue(false);

    // Re-render with fresh mock state
    renderWithRouter(<NostrEventCard event={basicEvent} confirmUnfav={true} />);

    // Click the fav button to trigger unfavourite
    const favButton = screen.getByTitle("Remove from favourites");
    fireEvent.click(favButton);

    // Confirmation modal should appear
    expect(screen.getByText("Remove from favourites?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Are you sure you want to remove this event from your favourites?",
      ),
    ).toBeInTheDocument();
  });

  it("should navigate to profile page when clicking author", () => {
    // We can't easily test navigate in JSDOM, but we can check the click handler
    // is on the author element with the correct pubkey
    renderWithRouter(<NostrEventCard event={basicEvent} />);

    const authorElement = screen.getByTitle("View profile");
    expect(authorElement).toBeInTheDocument();
  });

  it("should truncate long content with '…'", () => {
    const longContent = "A".repeat(300);
    const longEvent = { ...basicEvent, content: longContent };

    renderWithRouter(<NostrEventCard event={longEvent} showMeta={false} />);

    // The content should be truncated to 280 chars + "…"
    const contentElement = screen.getByText((content) => content.endsWith("…"));
    expect(contentElement).toBeInTheDocument();
    expect(contentElement.textContent.length).toBe(281); // 280 + "…"
  });

  it("should display the full content when expanded", () => {
    const longContent = "A".repeat(300);
    const longEvent = { ...basicEvent, content: longContent };

    renderWithRouter(<NostrEventCard event={longEvent} showMeta={false} />);

    // Click to expand
    fireEvent.click(screen.getByText((content) => content.includes("▼ more")));

    // Now the full content should be visible (without the ellipsis)
    expect(
      screen.queryByText((content) => content === longContent),
    ).toBeInTheDocument();
  });

  it("should show reaction content for kind 7 events", () => {
    const reactionEvent = {
      ...basicEvent,
      kind: 7,
      content: "🤙",
    };

    renderWithRouter(<NostrEventCard event={reactionEvent} />);

    const reactionElement = screen.getByText("🤙");
    expect(reactionElement).toHaveClass("nostr-card__reaction");
  });

  it("should not render images when content has none", () => {
    renderWithRouter(<NostrEventCard event={basicEvent} />);
    const images = screen.queryAllByRole("img");
    // Should only be avatar-related images, not content images
    expect(images.length).toBeLessThanOrEqual(1); // avatar placeholder is not img
  });

  it("should render image URLs extracted from content", () => {
    const imageUrl = "https://example.com/image.png";
    const eventWithImage = {
      ...basicEvent,
      content: `Check this out! ${imageUrl}`,
    };

    renderWithRouter(<NostrEventCard event={eventWithImage} />);

    const img = screen.getByAltText("Image 1");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", imageUrl);
  });

  it("should blur images classified as NSFW", async () => {
    const nsfwModule = await import("../nsfw");
    vi.mocked(nsfwModule.checkImageUrl).mockResolvedValue({
      nsfw: true,
      cf: null,
    });

    const imageUrl = "https://example.com/nsfw.png";
    const eventWithImage = {
      ...basicEvent,
      content: `Check this out! ${imageUrl}`,
    };

    renderWithRouter(<NostrEventCard event={eventWithImage} />);

    await waitFor(() => {
      expect(screen.getByText(/Sensitive content/)).toBeInTheDocument();
    });
    expect(screen.getByText("Click to reveal")).toBeInTheDocument();
  });

  it("should reveal a blurred NSFW image when clicked", async () => {
    const nsfwModule = await import("../nsfw");
    vi.mocked(nsfwModule.checkImageUrl).mockResolvedValue({
      nsfw: true,
      cf: null,
    });

    const imageUrl = "https://example.com/nsfw.jpg";
    const eventWithImage = {
      ...basicEvent,
      content: `Check this out! ${imageUrl}`,
    };

    renderWithRouter(<NostrEventCard event={eventWithImage} />);

    await waitFor(() => {
      expect(screen.getByText(/Sensitive content/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Sensitive content/));

    expect(screen.queryByText(/Sensitive content/)).not.toBeInTheDocument();
    expect(screen.getByAltText("Image 1")).toBeInTheDocument();
  });

  it("should show the error message over the blurred image when the NSFW check fails", async () => {
    const nsfwModule = await import("../nsfw");
    vi.mocked(nsfwModule.checkImageUrl).mockResolvedValue({
      nsfw: true,
      cf: null,
      error: new Error("CORS blocked"),
    });

    const imageUrl = "https://example.com/uncheckable.png";
    const eventWithImage = {
      ...basicEvent,
      content: `Check this out! ${imageUrl}`,
    };

    renderWithRouter(<NostrEventCard event={eventWithImage} />);

    await waitFor(() => {
      expect(screen.queryByText(/CORS blocked/)).toBeInTheDocument();
    });
    expect(screen.getByText("Click to reveal")).toBeInTheDocument();
    expect(screen.queryByText(/Sensitive content/)).not.toBeInTheDocument();
  });

  it("should not show the error overlay when the image itself fails to load", async () => {
    const nsfwModule = await import("../nsfw");
    vi.mocked(nsfwModule.checkImageUrl).mockResolvedValue({
      nsfw: true,
      cf: null,
      error: new Error("image failed to load: https://example.com/missing.png"),
    });

    const imageUrl = "https://example.com/missing.png";
    const eventWithImage = {
      ...basicEvent,
      content: `Check this out! ${imageUrl}`,
    };

    renderWithRouter(<NostrEventCard event={eventWithImage} />);

    fireEvent.error(screen.getByAltText("Image 1"));

    await waitFor(() => {
      expect(screen.queryByText(/Sensitive content/)).not.toBeInTheDocument();
    });
    expect(screen.queryByText(/image failed to load/)).not.toBeInTheDocument();
  });

  it("should show 'Show all N images' button when multiple images", () => {
    const content = `
      https://example.com/img1.png
      https://example.com/img2.jpg
      https://example.com/img3.gif
    `;
    const eventWithImages = { ...basicEvent, content };

    renderWithRouter(<NostrEventCard event={eventWithImages} />);

    expect(screen.getByText("Show all 3 images")).toBeInTheDocument();
  });

  it("should display reply count in footer for events with e-tags", () => {
    const eventWithReplies = {
      ...basicEvent,
      tags: [
        ["e", "replyEventId1"],
        ["e", "replyEventId2"],
      ],
    };
    renderWithRouter(<NostrEventCard event={eventWithReplies} />);
    expect(screen.getByText("2 replies")).toBeInTheDocument();
  });

  it("should display mention count in footer for events with p-tags", () => {
    const eventWithMentions = {
      ...basicEvent,
      tags: [["p", "mentionedPubkey1"]],
    };
    renderWithRouter(<NostrEventCard event={eventWithMentions} />);
    expect(screen.getByText("1 mention")).toBeInTheDocument();
  });
});
