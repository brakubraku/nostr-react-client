import { useEffect, useState } from "react";
import { checkImageUrl } from "./nsfw";

/**
 * An <img> that is checked with nsfwjs once it is loaded.
 *
 * The image is not fetched until `shouldLoad` is true. By default the component
 * renders an empty placeholder with a "Click to load" message; clicking it
 * flips the internal `shouldLoad` state to true and starts loading the image.
 * Once loaded, images classified as NSFW are blurred behind a "Sensitive
 * content" overlay until the viewer explicitly clicks to reveal them.
 */
export default function NsfwCheckedImage({
  src,
  alt,
  className,
  onClick,
  shouldLoad = false,
}) {
  // `shouldLoad` is both an input parameter and the internal state that drives
  // whether the image is loaded. The prop only seeds the initial value; the
  // "Click to load" placeholder flips it to true afterwards.
  const [shouldLoadState, setShouldLoadState] = useState(shouldLoad);
  const [nsfw, setNsfw] = useState(null);
  const [revealed, setRevealed] = useState(false);
  // indicated that <img> tag loading failed - in case where the src is unreachable for example
  const [imgFailed, setImgFailed] = useState(false);

  // Keep the internal state in sync when the caller changes `shouldLoad`
  // (e.g. NostrEventCard's "Load images" button flips it from false to true).
  useEffect(() => {
    setShouldLoadState(shouldLoad);
  }, [shouldLoad]);

  useEffect(() => {
    if (!shouldLoadState) {
      return;
    }

    let cancelled = false;

    checkImageUrl(src).then((result) => {
      if (!cancelled) {
        setNsfw(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [src, shouldLoadState]);

  useEffect(() => {
    if (shouldLoadState) {
      setImgFailed(false);
    }
  }, [src, shouldLoadState]);

  const blurred = ((nsfw?.nsfw ?? true) || nsfw?.error) && !revealed;

  function reveal(e) {
    e.stopPropagation();
    setRevealed(true);
  }

  function loadImage(e) {
    e.stopPropagation();
    setShouldLoadState(true);
  }

  if (!shouldLoadState) {
    return (
      <div
        className="nostr-card__image-wrap nostr-card__image-wrap--placeholder"
        role="button"
        tabIndex={0}
        title="Load image"
        aria-label={`Load image: ${alt || ""}`}
        onClick={loadImage}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            loadImage(e);
          }
        }}
      >
        <span className="nostr-card__load-hint">Click to load</span>
      </div>
    );
  }

  return (
    <div
      className={
        blurred
          ? "nostr-card__image-wrap nostr-card__image-wrap--nsfw"
          : "nostr-card__image-wrap"
      }
    >
      <img
        className={className}
        src={src}
        alt={alt}
        loading="lazy"
        onClick={onClick}
        onError={(e) => {
          e.target.style.display = "none";
          setImgFailed(true);
        }}
      />
      {blurred && !imgFailed && (
        <div
          className="nostr-card__nsfw-overlay"
          role="button"
          tabIndex={0}
          title="Reveal image"
          onClick={reveal}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              reveal(e);
            }
          }}
        >
          {!nsfw ? (
            <span className="nostr-card__nsfw-error">
              {`NSFW checking in progress...`}
            </span>
          ) : nsfw.error ? (
            <span className="nostr-card__nsfw-error">
              {`NSFW checking failed: ${nsfw.error?.message || String(nsfw.error)}`}
            </span>
          ) : (
            <span className="nostr-card__nsfw-label">Sensitive content</span>
          )}
          <span className="nostr-card__nsfw-hint">Click to reveal</span>
        </div>
      )}
      {nsfw?.cf?.length > 0 && (
        <ul
          className="nostr-card__classifications"
          aria-label="Image classifications"
        >
          {nsfw.cf.map((c) => (
            <li key={c.className} className="nostr-card__classification">
              <span className="nostr-card__classification-label">
                {`${c.className} `}
              </span>
              <span className="nostr-card__classification-score">
                {(c.probability * 100).toFixed(1)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
