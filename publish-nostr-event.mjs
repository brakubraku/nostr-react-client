/**
 * Simple example of publishing a Nostr event using NDK (Nostr Dev Kit)
 *
 * This script:
 * 1. Reads an existing signer from ~/.nostr-signer.json (nsec stored securely),
 *    or generates + persists a new one if none exists
 * 2. Connects to a relay
 * 3. Creates and signs a text note (kind 1)
 * 4. Publishes it to the relay
 * 5. Subscribes to confirm it was received
 *
 * Usage:
 *   node publish-nostr-event.mjs
 *
 * The signer key is persisted to ~/.nostr-signer.json so subsequent runs
 * reuse the same identity.
 *
 * ⚠️ WARNING: This file stores your private key in plain text on disk.
 *    In production use environment variables, encrypted key stores (NIP-49),
 *    or hardware signers instead.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import NDK, { NDKEvent, NDKPrivateKeySigner } from "@nostr-dev-kit/ndk";

const SIGNER_FILE = path.join(os.homedir(), ".nostr-signer.json");

/**
 * Load an existing signer from disk, or generate + persist a new one.
 */
async function getOrCreateSigner() {
  // Try to read an existing signer file
  if (fs.existsSync(SIGNER_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(SIGNER_FILE, "utf-8"));
      if (data.nsec) {
        const signer = new NDKPrivateKeySigner(data.nsec);
        const user = await signer.user();
        console.log(`🔑 Loaded existing signer — npub: ${user.npub}`);
        return signer;
      }
    } catch (err) {
      console.warn(`⚠️  Failed to read signer file (${SIGNER_FILE}), creating a new one.`);
    }
  }

  // Generate a brand-new key pair
  const signer = NDKPrivateKeySigner.generate();
  const user = await signer.user();

  // Persist the nsec to disk for reuse
  const nsec = signer.nsec; // getter, not a method
  fs.writeFileSync(SIGNER_FILE, JSON.stringify({ nsec }, null, 2), "utf-8");
  console.log(`🔑 Generated new signer — npub: ${user.npub}`);
  console.log(`💾 Saved to ${SIGNER_FILE}`);

  return signer;
}

async function main() {
  // --- Set up the signer (load or create + persist) ---
  const signer = await getOrCreateSigner();

  // --- Set up NDK ---
  const ndk = new NDK({
    explicitRelayUrls: ["wss://relay.primal.net"],
    signer,
    aiGuardrails: true, // catches common mistakes during development
  });

  // Connect to the relay
  console.log(`\n🔌 Connecting to relays...`);
  await ndk.connect();
  console.log(`✅ Connected!`);

  // --- Create and publish an event ---
  const event = new NDKEvent(ndk, {
    kind: 1, // kind 1 = short text note (NIP-01)
    content: "Hello Nostr I am garbage human! Publishing from NDK 🚀",
  });

  await event.sign();
  console.log(`\n📝 Signed event:`);
  console.log(`   ID:      ${event.id}`);
  console.log(`   Kind:    ${event.kind}`);
  console.log(`   Content: ${event.content}`);

  console.log(`\n📤 Publishing event...`);
  await event.publish();
  console.log(`✅ Event published!`);

  // --- Subscribe to confirm the event was received ---
  console.log(`\n🔍 Subscribing to verify event is on the relay...`);
  console.log(`   (waiting for relay confirmation, will time out after 10s)`);

  const timeout = setTimeout(() => {
    console.log(`   ⏱️  Timeout reached — the event was likely published but`);
    console.log(`      the relay may not echo it back immediately.`);
    console.log(`\n✅ Done!`);
    process.exit(0);
  }, 10_000);

  // Subscribe to events tagged as a "root" reply to the original
  ndk.subscribe(
    // { "#e": [event.id] },
    { kinds:[1] },
    {
      closeOnEose: false,
      onEvent: async (event) => {
        const markers = event.getMatchingTags("e");
        for (const tag of markers) {
          // tag[1] = event id, tag[3] = marker ("root", "reply", "mention")
          const marker = tag[3]
          if (marker === "root" || marker === "reply") {
            const replyTo = await event.fetchReplyEvent();
            console.log("<Event>: ", replyTo?.content, "<and reply>: ", event.content );
          }
        }
      },
    }
  );
}

main().catch((err) => {
  console.error(`❌ Error:`, err);
  process.exit(1);
});

