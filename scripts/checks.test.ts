import assert from "node:assert/strict";
import { test } from "node:test";

import { checkEntryPath, checkIdCollisions, checkIndex } from "./checks.ts";

const REPO = "octocat/my-frames";
const BASE = `https://github.com/${REPO}/releases/download/v1.0.0`;

/** A minimal index that passes every rule, to be broken one field at a time. */
function index(overrides: Record<string, unknown> = {}) {
  return {
    app: "card-anvil",
    kind: "frame-index",
    formatVersion: 1,
    contractVersion: "1.1",
    version: "1.0.0",
    generatedAt: "2026-09-10T00:00:00.000Z",
    generator: "@cardanvil/frame-kit@0.3.1",
    frames: [
      {
        id: "com.example.parchment",
        slug: "parchment",
        name: "Parchment",
        description: "A fixture",
        version: "1.0.0",
        tags: [],
        layouts: ["normal"],
        canvas: { width: 3264, height: 4440 },
        author: { name: "Octocat" },
        license: "CC-BY-4.0",
        contractVersion: "1.1",
        assetCount: 1,
        bundle: {
          file: "parchment-1.0.0.cardframe",
          bytes: 1024,
          sha256: "a".repeat(64),
          url: `${BASE}/parchment-1.0.0.cardframe`,
        },
        preview: {
          file: "parchment-1.0.0.preview.jpg",
          bytes: 512,
          sha256: "b".repeat(64),
          url: `${BASE}/parchment-1.0.0.preview.jpg`,
          width: 600,
          height: 816,
        },
        ...overrides,
      },
    ],
  };
}

const messages = (raw: unknown) =>
  checkIndex(REPO, "f.json", raw).problems.map((p) => p.message);

test("a well-formed index has nothing to say about it", () => {
  const { problems, index: parsed } = checkIndex(REPO, "f.json", index());
  assert.deepEqual(problems, []);
  assert.equal(parsed?.frames.length, 1);
});

test("refuses an id that is not reverse-DNS", () => {
  // Card Anvil turns an id into a filename, and the manifest schema lets any
  // string through — so a traversal must never get past the gallery either.
  assert.match(
    messages(index({ id: "../../../evil" })).join(" "),
    /reverse-DNS/,
  );
});

test("refuses an id Card Anvil already ships", () => {
  assert.match(
    messages(index({ id: "com.cardanvil.m15" })).join(" "),
    /already ships/,
  );
});

test("refuses a bundle served by someone else", () => {
  const elsewhere = {
    bundle: {
      file: "x.cardframe",
      bytes: 1,
      sha256: "c".repeat(64),
      url: "https://example.com/evil.cardframe",
    },
  };
  assert.match(messages(index(elsewhere)).join(" "), /not published by/);
});

test("refuses a bundle bigger than the app will open", () => {
  const huge = {
    bundle: {
      file: "x.cardframe",
      bytes: 600 * 1024 * 1024,
      sha256: "c".repeat(64),
      url: `${BASE}/x.cardframe`,
    },
  };
  assert.match(messages(index(huge)).join(" "), /larger than Card Anvil/);
});

test("refuses a frame format this build cannot read", () => {
  assert.match(messages(index({ contractVersion: "2.0" })).join(" "), /2/);
});

test("says so when the index is not an index at all", () => {
  assert.match(messages({ nope: true }).join(" "), /not a frame index/);
});

test("refuses a frame with no licence or author", () => {
  const said = messages(index({ license: " ", author: { name: " " } }));
  assert.match(said.join(" "), /needs a license/);
  assert.match(said.join(" "), /needs an author/);
});

test("refuses an id already claimed by another repository", () => {
  const parsed = checkIndex(REPO, "a.json", index()).index;
  assert.ok(parsed);
  const problems = checkIdCollisions([
    { repository: REPO, file: "a.json", index: parsed },
    { repository: "someone/else", file: "b.json", index: parsed },
  ]);
  assert.equal(problems.length, 1);
  assert.match(problems[0]?.message ?? "", /already listed by octocat/);
});

test("lets one repository keep listing its own ids", () => {
  const parsed = checkIndex(REPO, "a.json", index()).index;
  assert.ok(parsed);
  assert.deepEqual(
    checkIdCollisions([
      { repository: REPO, file: "a.json", index: parsed },
      { repository: REPO, file: "a.json", index: parsed },
    ]),
    [],
  );
});

test("an entry belongs at the path its repository names", () => {
  assert.deepEqual(
    checkEntryPath(REPO, "repositories/octocat/my-frames.json"),
    [],
  );
  assert.match(
    checkEntryPath(REPO, "repositories/wrong/place.json")[0]?.message ?? "",
    /belongs at repositories\/octocat\/my-frames\.json/,
  );
});
