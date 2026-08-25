import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import NsfwCheckedImage from "../NsfwCheckedImage";
import { checkImageUrl } from "../nsfw";

// Mock nsfwjs checks: images are safe by default, tests can opt into NSFW.
vi.mock("../nsfw", () => ({
  checkImageUrl: vi.fn(() => Promise.resolve({ nsfw: false, cf: null })),
}));

const src = "https://example.com/cat.png";

describe("NsfwCheckedImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should show a click-to-load placeholder instead of the image by default", () => {
    render(<NsfwCheckedImage src={src} alt="Cat" />);

    expect(screen.getByText("Click to load")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(checkImageUrl).not.toHaveBeenCalled();
  });

  it("should defer loading the image and the NSFW check until the placeholder is clicked", async () => {
    render(<NsfwCheckedImage src={src} alt="Cat" />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Click to load"));

    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", src);
    expect(img).toHaveAttribute("alt", "Cat");

    await waitFor(() => {
      expect(checkImageUrl).toHaveBeenCalledWith(src);
    });
  });

  it("should render the image immediately when shouldLoad is true", async () => {
    render(<NsfwCheckedImage src={src} alt="Cat" shouldLoad />);

    expect(screen.queryByText("Click to load")).not.toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("src", src);

    await waitFor(() => {
      expect(checkImageUrl).toHaveBeenCalledWith(src);
    });
  });

  it("should blur an NSFW image after it is loaded via the placeholder", async () => {
    vi.mocked(checkImageUrl).mockResolvedValue({ nsfw: true, cf: null });

    render(<NsfwCheckedImage src={src} alt="Cat" />);

    fireEvent.click(screen.getByText("Click to load"));

    await waitFor(() => {
      expect(screen.getByText(/Sensitive content/)).toBeInTheDocument();
    });
    expect(screen.getByText("Click to reveal")).toBeInTheDocument();
  });
});
