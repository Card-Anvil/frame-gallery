import { z } from "zod";

import type { FrameIndex, IndexedFrame } from "@cardanvil/frame-kit/packaging";

export const GALLERY_FILENAME = "gallery.json";

/**
 * Bumped when the shape changes in a way an older Card Anvil cannot read.
 * Adding a field does not count — the app parses with zod, which ignores what
 * it does not know.
 */
export const GALLERY_FORMAT_VERSION = 1;

/** How a listed repository was doing at the last refresh. */
export const SourceStateSchema = z.enum(["ok", "stale", "unreachable"]);
export type SourceState = z.infer<typeof SourceStateSchema>;

/**
 * How many refreshes in a row a repository may fail before its frames are
 * dropped.
 *
 * Long enough to ride out an outage, short enough that a dead listing stops
 * offering downloads that 404. At four refreshes a day, this is about a week.
 */
export const FAILURES_BEFORE_DROPPING = 28;

export interface GallerySource {
  repository: string;
  state: SourceState;
  /** Where the index was read from, which is not always the `latest` URL. */
  indexUrl: string;
  lastCheckedAt: string;
  /**
   * When it last worked — present only while it is not working.
   *
   * For a healthy source this would just repeat `lastCheckedAt`, and writing
   * it would make every refresh a change and so a commit saying nothing.
   */
  lastSucceededAt?: string;
  consecutiveFailures: number;
  failureReason?: string;
}

export interface GalleryFrame extends IndexedFrame {
  /** The repository that publishes it — the answer to "who is this from". */
  repository: string;
}

export interface Gallery {
  app: "card-anvil";
  kind: "frame-gallery";
  formatVersion: number;
  generatedAt: string;
  sources: GallerySource[];
  frames: GalleryFrame[];
}

/** One repository's outcome this run. */
export interface Outcome {
  repository: string;
  indexUrl: string;
  index?: FrameIndex;
  error?: string;
}

/**
 * The gallery, given this run's outcomes and the one it is replacing.
 *
 * Pure, so the rules below are testable without a network or a filesystem:
 *
 * - A repository that failed **keeps the frames it had.** A transient outage
 *   must never empty the gallery.
 * - One that has failed for long enough loses them, because a listing whose
 *   downloads 404 is worse than no listing.
 * - Everything is sorted, so a refresh that changed nothing produces a
 *   byte-identical file and therefore no commit.
 */
export function buildGallery(
  outcomes: readonly Outcome[],
  previous: Gallery | undefined,
  now: string,
): Gallery {
  const previousSources = new Map(
    (previous?.sources ?? []).map((s) => [s.repository, s]),
  );
  const previousFrames = new Map<string, GalleryFrame[]>();
  for (const frame of previous?.frames ?? []) {
    previousFrames.set(frame.repository, [
      ...(previousFrames.get(frame.repository) ?? []),
      frame,
    ]);
  }

  const sources: GallerySource[] = [];
  const frames: GalleryFrame[] = [];

  for (const outcome of outcomes) {
    const before = previousSources.get(outcome.repository);

    if (outcome.index) {
      sources.push({
        repository: outcome.repository,
        state: "ok",
        indexUrl: outcome.indexUrl,
        lastCheckedAt: now,
        consecutiveFailures: 0,
      });
      frames.push(
        ...outcome.index.frames.map((frame) => ({
          ...frame,
          repository: outcome.repository,
        })),
      );
      continue;
    }

    const failures = (before?.consecutiveFailures ?? 0) + 1;
    // A source that was fine last time succeeded when it was last checked.
    const succeededAt =
      before?.state === "ok" ? before.lastCheckedAt : before?.lastSucceededAt;
    const dropped = failures >= FAILURES_BEFORE_DROPPING;
    sources.push({
      repository: outcome.repository,
      state: dropped ? "unreachable" : "stale",
      indexUrl: before?.indexUrl ?? outcome.indexUrl,
      lastCheckedAt: now,
      ...(succeededAt === undefined ? {} : { lastSucceededAt: succeededAt }),
      consecutiveFailures: failures,
      failureReason: outcome.error ?? "unknown error",
    });
    if (!dropped) {
      frames.push(...(previousFrames.get(outcome.repository) ?? []));
    }
  }

  return {
    app: "card-anvil",
    kind: "frame-gallery",
    formatVersion: GALLERY_FORMAT_VERSION,
    generatedAt: now,
    sources: sources.sort((a, b) => a.repository.localeCompare(b.repository)),
    frames: frames.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/**
 * Whether two galleries differ in anything but when they were generated.
 *
 * `generatedAt` changes every run; committing that alone would be a commit a
 * day saying nothing.
 */
export function isSameGallery(a: Gallery, b: Gallery): boolean {
  const strip = ({ generatedAt: _generatedAt, ...rest }: Gallery) => ({
    ...rest,
    sources: rest.sources.map(
      ({ lastCheckedAt: _lastCheckedAt, ...source }) => source,
    ),
  });
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}
