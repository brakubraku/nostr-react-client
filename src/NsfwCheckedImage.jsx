import { useEffect, useState } from "react";
import { checkImageUrl } from "./nsfw";

/**
 * An <img> that is checked with nsfwjs as soon as it is mounted.
 *
 * Images classified as NSFW are blurred behind a "Sensitive content" overlay
 * until the viewer explicitly clicks to reveal them.
 */
export default function NsfwCheckedImage({ src, alt, className, onClick }) {
  const [nsfw, setNsfw] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    checkImageUrl(src).then((result) => {
      if (!cancelled) {
        setNsfw(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [src]);

  useEffect(() => {
    setImgFailed(false);
  }, [src]);

  const blurred = ((nsfw?.nsfw ?? true) || nsfw?.error) && !revealed;

  function reveal(e) {
    e.stopPropagation();
    setRevealed(true);
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
          {nsfw?.error ? (
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
