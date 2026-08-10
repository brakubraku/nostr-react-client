import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getFollows, followsToText, importFollowsText } from "./follows";
import { truncateHex } from "./utils";

/**
 * FollowingAvatar — the account's profile picture, falling back to an
 * initial placeholder when no picture is available or it fails to load.
 */
function FollowingAvatar({ account }) {
  const [imgFailed, setImgFailed] = useState(false);
  const displayName =
    account.displayName || account.name || truncateHex(account.pubkey);

  if (account.picture && !imgFailed) {
    return (
      <img
        className="nostr-following__avatar"
        src={account.picture}
        alt=""
        loading="lazy"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div className="nostr-following__avatar nostr-following__avatar-placeholder">
      {displayName.charAt(0).toUpperCase()}
    </div>
  );
}

/**
 * NostrFollowing — displays all followed accounts from localStorage.
 *
 * Each followed account is shown as a grid tile with their profile picture
 * and name; clicking a tile opens that account's profile page. The header
 * provides Export/Import buttons for moving the list to/from a text file.
 */
export default function NostrFollowing() {
  const navigate = useNavigate();
  const [follows, setFollows] = useState([]);
  const [status, setStatus] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    function loadFollows() {
      setFollows(getFollows());
    }

    // Load immediately
    loadFollows();

    // Subscribe to the observable (react to changes within the same tab)
    const unsubscribe = getFollows.subscribe(loadFollows);

    // Also listen for changes from other tabs (localStorage sync)
    window.addEventListener("storage", loadFollows);
    return () => {
      unsubscribe();
      window.removeEventListener("storage", loadFollows);
    };
  }, []);

  /**
   * Download the current follows list as a plain-text file with one hex
   * pubkey per line.
   */
  function handleExport() {
    if (follows.length === 0) return;

    const text = followsToText(follows);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nostr-follows-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setStatus(
      `Exported ${follows.length} account${follows.length !== 1 ? "s" : ""}.`,
    );
  }

  /**
   * Read a selected text file and add any valid accounts it contains.
   */
  function handleImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    readFileText(file).then(async (text) => {
      const { imported, duplicates, invalid } = await importFollowsText(text);
      if (imported === 0 && duplicates === 0 && invalid === 0) {
        setStatus("No accounts found in that file.");
        return;
      }
      const parts = [`Imported ${imported} account${imported !== 1 ? "s" : ""}`];
      if (duplicates > 0) {
        parts.push(`${duplicates} already followed`);
      }
      if (invalid > 0) {
        parts.push(`${invalid} invalid line${invalid !== 1 ? "s" : ""} skipped`);
      }
      setStatus(`${parts.join(", ")}.`);
    }).catch(() => {
      setStatus("Couldn't read that file.");
    });
  }

  return (
    <div className="nostr-following">
      <div className="nostr-following__header">
        <h2 className="nostr-following__title">Following</h2>
        <div className="nostr-following__actions">
          {follows.length > 0 && (
            <span className="nostr-following__count">
              {follows.length} account{follows.length !== 1 ? "s" : ""}
            </span>
          )}
          <button
            type="button"
            className="nostr-following__btn"
            onClick={handleExport}
            disabled={follows.length === 0}
            title={follows.length === 0 ? "No accounts to export" : undefined}
          >
            Export
          </button>
          <button
            type="button"
            className="nostr-following__btn"
            onClick={() => fileInputRef.current?.click()}
          >
            Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,text/plain"
            className="nostr-following__file-input"
            onChange={handleImport}
          />
        </div>
      </div>

      {status && (
        <p className="nostr-following__status" role="status">
          {status}
        </p>
      )}

      {follows.length === 0 ? (
        <div className="nostr-following__empty">
          <p>You're not following any accounts yet.</p>
          <p className="nostr-following__hint">
            Look up a profile and click <strong>Follow</strong> to add it here.
          </p>
        </div>
      ) : (
        <div className="nostr-following__grid">
          {follows.map((account) => {
            const displayName =
              account.displayName || account.name || truncateHex(account.pubkey);
            return (
              <button
                key={account.pubkey}
                className="nostr-following__card"
                onClick={() => navigate(`/profile/${account.pubkey}`)}
                title={`View ${displayName}'s profile`}
              >
                <FollowingAvatar account={account} />
                <span className="nostr-following__name">{displayName}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Read a File as UTF-8 text.
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
