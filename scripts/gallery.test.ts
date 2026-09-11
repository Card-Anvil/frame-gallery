import assert from "node:assert/strict";
import { test } from "node:test";

import type { FrameIndex } from "@cardanvil/frame-kit/packaging";

import {
  FAILURES_BEFORE_DROPPING,
  type Gallery,
  buildGallery,
  isSameGallery,
} from "./gallery.ts";

const NOW = "2026-09-11T00:00:00.000Z";
const EARLIER = "2026-09-01T00:00:00.000Z";

function frame(id: string) {
  return {
    id,
    slug: id.split(".").pop() ?? id,
    name: id,
    description: "",
    version: "1.0.0",
    tags: [],
    layouts: ["normal"],
    canvas: { width: 3264, height: 4440 },
    author: { name: "Someone" },
    license: "CC-BY-4.0",
    contractVersion: "1.1",
    assetCount: 1,
    bundle: { file: "f.cardframe", bytes: 1, sha256: "a".repeat(64) },
    preview: {
      file: "f.jpg",
      bytes: 1,
      sha256: "b".repeat(64),
      width: 1,
      height: 1,
    },
  };
}

const index = (ids: string[]) =>
  ({ frames: ids.map(frame) }) as unknown as FrameIndex;

const ok = (repository: string, ids: string[]) => ({
  repository,
  indexUrl: `https://example.test/${repository}`,
  index: index(ids),
});

const failed = (repository: string, error = "HTTP 500") => ({
  repository,
  indexUrl: `https://example.test/${repository}`,
  error,
});

test("lists every frame a healthy repository publishes", () => {
  const gallery = buildGallery(
    [ok("a/b", ["com.a.one", "com.a.two"])],
    undefined,
    NOW,
  );

  assert.deepEqual(
    gallery.frames.map((f) => f.id),
    ["com.a.one", "com.a.two"],
  );
  const [frameOne] = gallery.frames;
  const [source] = gallery.sources;
  assert.ok(frameOne);
  assert.ok(source);
  assert.equal(frameOne.repository, "a/b");
  assert.equal(source.state, "ok");
});

test("a repository that fails keeps the frames it had", () => {
  // The point of the whole staleness rule: one bad fetch must not empty the
  // gallery for everyone using that frame.
  const before = buildGallery([ok("a/b", ["com.a.one"])], undefined, EARLIER);

  const after = buildGallery([failed("a/b")], before, NOW);

  assert.deepEqual(
    after.frames.map((f) => f.id),
    ["com.a.one"],
  );
  const [source] = after.sources;
  assert.ok(source);
  assert.equal(source.state, "stale");
  assert.equal(source.consecutiveFailures, 1);
  assert.equal(source.lastSucceededAt, EARLIER);
  assert.match(source.failureReason ?? "", /500/);
});

test("gives up once a repository has failed for long enough", () => {
  // A listing whose downloads 404 is worse than no listing.
  let gallery: Gallery = buildGallery(
    [ok("a/b", ["com.a.one"])],
    undefined,
    EARLIER,
  );
  for (let i = 0; i < FAILURES_BEFORE_DROPPING; i++) {
    gallery = buildGallery([failed("a/b")], gallery, NOW);
  }

  const [source] = gallery.sources;
  assert.ok(source);
  assert.deepEqual(gallery.frames, []);
  assert.equal(source.state, "unreachable");
  assert.equal(source.consecutiveFailures, FAILURES_BEFORE_DROPPING);
});

test("recovering resets the count and restores the frames", () => {
  const stale = buildGallery(
    [failed("a/b")],
    buildGallery([ok("a/b", ["com.a.one"])], undefined, EARLIER),
    NOW,
  );

  const recovered = buildGallery([ok("a/b", ["com.a.one"])], stale, NOW);

  const [source] = recovered.sources;
  assert.ok(source);
  assert.equal(source.state, "ok");
  assert.equal(source.consecutiveFailures, 0);
});

test("an entry removed from the repository disappears entirely", () => {
  const before = buildGallery(
    [ok("a/b", ["com.a.one"]), ok("c/d", ["com.c.one"])],
    undefined,
    EARLIER,
  );

  const after = buildGallery([ok("a/b", ["com.a.one"])], before, NOW);

  assert.deepEqual(
    after.sources.map((s) => s.repository),
    ["a/b"],
  );
  assert.deepEqual(
    after.frames.map((f) => f.id),
    ["com.a.one"],
  );
});

test("sorts, so an unchanged refresh writes an identical file", () => {
  const one = buildGallery(
    [ok("z/z", ["com.z.one"]), ok("a/a", ["com.a.one"])],
    undefined,
    NOW,
  );
  const two = buildGallery(
    [ok("a/a", ["com.a.one"]), ok("z/z", ["com.z.one"])],
    undefined,
    NOW,
  );

  assert.equal(JSON.stringify(one), JSON.stringify(two));
});

test("a refresh that changed nothing but the clock is not a change", () => {
  const before = buildGallery([ok("a/b", ["com.a.one"])], undefined, EARLIER);
  const after = buildGallery([ok("a/b", ["com.a.one"])], before, NOW);

  assert.ok(isSameGallery(before, after));
  assert.notEqual(before.generatedAt, after.generatedAt);
});

test("a refresh that changed a frame is a change", () => {
  const before = buildGallery([ok("a/b", ["com.a.one"])], undefined, EARLIER);
  const after = buildGallery(
    [ok("a/b", ["com.a.one", "com.a.two"])],
    before,
    NOW,
  );

  assert.ok(!isSameGallery(before, after));
});
