import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import NostrFollowing from "../NostrFollowing";

// Mock the follows module so tests stay isolated.
vi.mock("../follows", () => ({
  getFollows: Object.assign(vi.fn(() => []), {
    subscribe: vi.fn(() => vi.fn()),
  }),
  isFollowing: vi.fn(() => false),
  toggleFollow: vi.fn(() => true),
  removeFollow: vi.fn(),
}));

function LocationProbe() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

function renderFollowing() {
  return render(
    <MemoryRouter>
      <NostrFollowing />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe("NostrFollowing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows an empty state when no accounts are followed", async () => {
    const { getFollows } = await import("../follows");
    vi.mocked(getFollows).mockReturnValue([]);

    renderFollowing();

    expect(
      screen.getByText("You're not following any accounts yet."),
    ).toBeInTheDocument();
  });

  it("renders followed accounts as a grid with pictures and names", async () => {
    const { getFollows } = await import("../follows");
    vi.mocked(getFollows).mockReturnValue([
      {
        pubkey: "pk1",
        displayName: "Alice",
        picture: "https://example.com/alice.png",
      },
      {
        pubkey: "pk2",
        name: "bob",
        picture: "https://example.com/bob.png",
      },
    ]);

    const { container } = renderFollowing();

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("bob")).toBeInTheDocument();
    expect(container.querySelectorAll("img.nostr-following__avatar")).toHaveLength(2);

    const grid = container.querySelector(".nostr-following__grid");
    expect(grid).toBeInTheDocument();
    expect(grid.querySelectorAll(".nostr-following__card")).toHaveLength(2);
  });

  it("shows an initial placeholder when an account has no picture", async () => {
    const { getFollows } = await import("../follows");
    vi.mocked(getFollows).mockReturnValue([
      { pubkey: "pk1", displayName: "Alice" },
    ]);

    const { container } = renderFollowing();

    expect(screen.getByText("A")).toBeInTheDocument();
    expect(
      container.querySelector(".nostr-following__avatar-placeholder"),
    ).toBeInTheDocument();
  });

  it("navigates to the account's profile when a tile is clicked", async () => {
    const { getFollows } = await import("../follows");
    vi.mocked(getFollows).mockReturnValue([
      { pubkey: "pk1", displayName: "Alice" },
    ]);

    renderFollowing();

    fireEvent.click(screen.getByTitle("View Alice's profile"));
    expect(screen.getByTestId("location")).toHaveTextContent("/profile/pk1");
  });
});
