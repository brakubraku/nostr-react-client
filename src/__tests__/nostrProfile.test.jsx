import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import NostrProfile from "../NostrProfile";

// Mock the favourites and follows modules so tests stay isolated.
vi.mock("../favourites", () => ({
  getFavourites: Object.assign(() => [], { subscribe: vi.fn(() => vi.fn()) }),
  isFavorite: vi.fn(() => false),
  toggleFavorite: vi.fn(() => true),
  removeFavorite: vi.fn(),
}));

vi.mock("../follows", () => ({
  getFollows: Object.assign(() => [], { subscribe: vi.fn(() => vi.fn()) }),
  isFollowing: vi.fn(() => false),
  toggleFollow: vi.fn(() => true),
  removeFollow: vi.fn(),
}));

// Mock nsfwjs checks: images are safe by default, tests can opt into NSFW.
vi.mock("../nsfw", () => ({
  checkImageUrl: vi.fn(() => Promise.resolve({ nsfw: false, cf: null })),
}));

const VALID_PUBKEY = "a".repeat(64);
const mockProfile = {
  displayName: "Alice",
  name: "alice",
  picture: "https://example.com/alice.png",
  nip05: "alice@example.com",
};

const mockNdk = {
  getUser: vi.fn(() => ({
    fetchProfile: vi.fn().mockResolvedValue(undefined),
    profile: mockProfile,
  })),
  fetchEvents: vi.fn().mockResolvedValue(new Map()),
};

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={[`/profile/${VALID_PUBKEY}`]}>
      <Routes>
        <Route
          path="/profile/:pubkey"
          element={<NostrProfile ndk={mockNdk} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("NostrProfile follow button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a Follow button for a looked-up profile", async () => {
    renderProfile();

    const button = await screen.findByRole("button", { name: "Follow" });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("follows the account when the button is clicked", async () => {
    const { toggleFollow } = await import("../follows");
    vi.mocked(toggleFollow).mockReturnValue(true);
    renderProfile();

    const button = await screen.findByRole("button", { name: "Follow" });
    await userEvent.click(button);

    expect(toggleFollow).toHaveBeenCalledWith(
      expect.objectContaining({
        pubkey: VALID_PUBKEY,
        name: "alice",
        displayName: "Alice",
        picture: "https://example.com/alice.png",
        nip05: "alice@example.com",
      }),
    );
    expect(toggleFollow.mock.results.at(-1).value).toBe(true);
    expect(
      await screen.findByRole("button", { name: "Following" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("shows Following and unfollows when the account is already followed", async () => {
    const followsModule = await import("../follows");
    vi.mocked(followsModule.isFollowing).mockReturnValue(true);
    vi.mocked(followsModule.toggleFollow).mockReturnValue(false);
    renderProfile();

    const button = await screen.findByRole("button", { name: "Following" });
    expect(button).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(button);

    expect(followsModule.toggleFollow).toHaveBeenCalledWith(
      expect.objectContaining({ pubkey: VALID_PUBKEY }),
    );
    expect(
      await screen.findByRole("button", { name: "Follow" }),
    ).toHaveAttribute("aria-pressed", "false");
  });
});

describe("NostrProfile profile lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls fetchProfile on the user returned by ndk when a pubkey is in the URL", async () => {
    renderProfile();

    expect(await screen.findByText("Alice")).toBeInTheDocument();

    expect(mockNdk.getUser).toHaveBeenCalledWith({ pubkey: VALID_PUBKEY });
    const user = mockNdk.getUser.mock.results.at(-1).value;
    expect(user.fetchProfile).toHaveBeenCalled();
  });
});

