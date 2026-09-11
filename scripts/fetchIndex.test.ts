import assert from "node:assert/strict";
import { test } from "node:test";

import { pickIndexAsset } from "./fetchIndex.ts";

const release = (names: string[], extra = {}) => ({
  draft: false,
  prerelease: false,
  assets: names.map((name) => ({
    name,
    browser_download_url: `https://example.test/${name}`,
  })),
  ...extra,
});

test("skips a newer release that is not a frame release", () => {
  // Exactly what Card Anvil's own frames repository looks like: a frame-kit
  // package release sits on top of the frame bundles, and GitHub hands it to
  // `releases/latest` because nothing else is marked latest.
  const picked = pickIndexAsset([
    release(["cardanvil-frame-kit-0.3.1.tgz"]),
    release(["frame-index.json", "m15-1.0.0.cardframe"]),
  ]);

  assert.equal(picked, "https://example.test/frame-index.json");
});

test("ignores drafts and prereleases", () => {
  const picked = pickIndexAsset([
    release(["frame-index.json"], { draft: true }),
    release(["frame-index.json"], { prerelease: true }),
    release(["frame-index.json", "x.cardframe"]),
  ]);

  assert.equal(picked, "https://example.test/frame-index.json");
});

test("finds nothing when no release carries an index", () => {
  assert.equal(pickIndexAsset([release(["notes.txt"])]), undefined);
  assert.equal(pickIndexAsset([]), undefined);
});
