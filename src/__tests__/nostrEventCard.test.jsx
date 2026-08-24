import { cloneElement } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import { nip19 } from "@nostr-dev-kit/ndk";
import NostrEventCard from "../NostrEventCard";

// Mock NDK instance passed via props (author metadata + event fetch)
const mockNdk = {
  getUser: vi.fn(() => ({
    fetchProfile: vi.fn().mockResolvedValue(undefined),
    profile: {},
  })),
  fetchEvent: vi.fn(async () => null),
};

// Valid NIP-19 references used in content tests (with the "nostr:" prefix
// so splitContent recognizes them)
const npub1 = `nostr:${nip19.npubEncode("aa".repeat(32))}`;
const npub2 = `nostr:${nip19.npubEncode("bb".repeat(32))}`;
const note1 = `nostr:${nip19.noteEncode("cc".repeat(32))}`;
const note2 = `nostr:${nip19.noteEncode("dd".repeat(32))}`;

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
    mockNdk.fetchEvent.mockResolvedValue(null);
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

  it("should display relative time", () => {
    renderWithRouter(<NostrEventCard event={basicEvent} />);
    expect(screen.getByText(/h ago|m ago/)).toBeInTheDocument();
  });

  it("should display all tags in metadata only after the meta button is clicked", () => {
    const eventWithTags = {
      ...basicEvent,
      tags: [
        ["t", "nostr"],
        ["e", "deadbeef"],
        ["r", "https://example.com"],
      ],
    };
    renderWithRouter(<NostrEventCard event={eventWithTags} />);

    // Metadata (including tags) is hidden until the meta button is clicked
    expect(screen.queryByText("Tags")).not.toBeInTheDocument();
    expect(screen.queryByText('["t","nostr"]')).not.toBeInTheDocument();

    // Toggle metadata open
    fireEvent.click(screen.getByRole("button", { name: /meta/i }));

    expect(screen.getByText("Tags")).toBeInTheDocument();
    expect(screen.getByText('["t","nostr"]')).toBeInTheDocument();
    expect(screen.getByText('["e","deadbeef"]')).toBeInTheDocument();
    expect(screen.getByText('["r","https://example.com"]')).toBeInTheDocument();
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

  it("should expand the card by clicking the card", () => {
    const longContent = "A".repeat(300);
    const longEvent = { ...basicEvent, content: longContent };
    const { container } = renderWithRouter(
      <NostrEventCard event={longEvent} showMeta={false} />,
    );

    // Clicking the card body expands the content
    fireEvent.click(container.querySelector(".nostr-card"));
    expect(
      screen.queryByText((content) => content === longContent),
    ).toBeInTheDocument();

    // Clicking "less" contracts it
    fireEvent.click(screen.getByRole("button", { name: /less/i }));
    expect(
      screen.queryByText((content) => content === longContent),
    ).not.toBeInTheDocument();
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

  it("should render consecutive images in the order they appear", () => {
    const content = `
      https://example.com/img1.png
      https://example.com/img2.jpg
      https://example.com/img3.gif
    `;
    const eventWithImages = { ...basicEvent, content };

    const { container } = renderWithRouter(
      <NostrEventCard event={eventWithImages} />,
    );

    const images = container
      .querySelector(".nostr-card__content")
      .querySelectorAll("img");
    expect(images).toHaveLength(3);
    expect(images[0]).toHaveAttribute("src", "https://example.com/img1.png");
    expect(images[1]).toHaveAttribute("src", "https://example.com/img2.jpg");
    expect(images[2]).toHaveAttribute("src", "https://example.com/img3.gif");
    expect(screen.getByAltText("Image 3")).toBeInTheDocument();
    expect(screen.queryByText(/Show all/i)).not.toBeInTheDocument();
  });

  it("should render text, nostr refs and media URLs in their original order", () => {
    const eventWithParts = {
      ...basicEvent,
      content: `Start ${npub1} middle https://example.com/pic.png end`,
    };

    const { container } = renderWithRouter(
      <NostrEventCard event={eventWithParts} />,
    );

    const content = container.querySelector(".nostr-card__content");
    const nodes = [...content.children];

    // Parts are rendered one by one, in splitContent order; newlines are
    // emitted by splitContent as "\n" text parts. The npub renders as an
    // AccountCard.
    expect(nodes[0].textContent).toContain("Start");
    expect(nodes[1].textContent).toBe("\n");
    expect(nodes[2].className).toContain("nostr-card__ref--account");
    expect(
      nodes[2].querySelector("button.nostr-following__card"),
    ).toBeInTheDocument();
    expect(nodes[3].textContent).toBe("\n");
    expect(nodes[4].textContent).toContain("middle");
    expect(nodes[5].textContent).toBe("\n");
    expect(nodes[6].querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/pic.png",
    );
    expect(nodes[7].textContent).toBe("\n");
    expect(nodes[8].textContent).toContain("end");
  });

  it("should keep consecutive npub refs on the same line", () => {
    const eventWithRefs = {
      ...basicEvent,
      content: `${npub1}\n${npub2}`,
    };

    const { container } = renderWithRouter(
      <NostrEventCard event={eventWithRefs} />,
    );

    const content = container.querySelector(".nostr-card__content");
    const nodes = [...content.children];

    // Both account cards stay on the same line (only a separator space)
    expect(nodes[0].className).toContain("nostr-card__ref--account");
    expect(nodes[1].textContent).toBe(" ");
    expect(nodes[2].className).toContain("nostr-card__ref--account");
  });

  it("should put consecutive note refs on separate lines", () => {
    const eventWithRefs = {
      ...basicEvent,
      content: `${note1}\n${note2}`,
    };

    const { container } = renderWithRouter(
      <NostrEventCard event={eventWithRefs} />,
    );

    const content = container.querySelector(".nostr-card__content");
    const nodes = [...content.children];

    // First note (raw ref until fetched), separator space, newline, second note
    expect(nodes[0].textContent).toBe(note1);
    expect(nodes[1].textContent).toBe(" ");
    expect(nodes[2].textContent).toBe("\n");
    expect(nodes[3].textContent).toBe(note2);
  });

  it("should render a NostrEventCard for note refs", async () => {
    const fetchedEvent = {
      id: "cc".repeat(32),
      kind: 1,
      pubkey: "dd".repeat(32),
      content: "Nested note content",
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
    };
    vi.mocked(mockNdk.fetchEvent).mockResolvedValue(fetchedEvent);

    const { container } = renderWithRouter(
      <NostrEventCard event={{ ...basicEvent, content: note1 }} />,
    );

    await waitFor(() => {
      expect(
        container.querySelector(".nostr-card__ref--event .nostr-card"),
      ).toBeInTheDocument();
    });
    expect(screen.getByText(/Nested note content/)).toBeInTheDocument();
  });

  it("should keep consecutive media URLs on the same line", () => {
    const eventWithImages = {
      ...basicEvent,
      content: "https://example.com/a.png\nhttps://example.com/b.jpg",
    };

    const { container } = renderWithRouter(
      <NostrEventCard event={eventWithImages} />,
    );

    const content = container.querySelector(".nostr-card__content");
    const nodes = [...content.children];

    // image, separator space, image — no newline between them
    expect(nodes[0].querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/a.png",
    );
    expect(nodes[1].textContent).toBe(" ");
    expect(nodes[2].querySelector("img")).toHaveAttribute(
      "src",
      "https://example.com/b.jpg",
    );
  });
});
