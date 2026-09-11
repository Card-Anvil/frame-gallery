import { isContractCompatible } from "@cardanvil/frame-kit/manifest";
import {
  type FrameIndex,
  FrameIndexSchema,
} from "@cardanvil/frame-kit/packaging";

import { BUILTIN_FRAME_IDS, entryPathFor } from "./entry.ts";

/**
 * The largest bundle the app will read.
 *
 * Kept in step with `src/frames/bundle/limits.ts` in Card Anvil by hand — a
 * frame listed here that the app refuses to open is a broken install button,
 * so it is better refused at submission.
 */
export const MAX_BUNDLE_BYTES = 512 * 1024 * 1024;

/** The reverse-DNS rule `frame.meta.json` enforces on an id. */
const ID_PATTERN = new RegExp("^[a-z0-9]+([.][a-z0-9-]+)+$");

export interface Problem {
  file: string;
  message: string;
}

/** Where a repository's frames must be downloaded from: its own releases. */
function releasePrefix(repository: string): string {
  return `https://github.com/${repository}/releases/`;
}

/**
 * Everything checkable about one repository's index, given its bytes.
 *
 * Pure on purpose: the fetching lives in the caller, so every rule here is
 * testable against a recorded index with no network.
 */
export function checkIndex(
  repository: string,
  file: string,
  raw: unknown,
): { problems: Problem[]; index?: FrameIndex } {
  const problems: Problem[] = [];
  const say = (message: string) => problems.push({ file, message });

  const parsed = FrameIndexSchema.safeParse(raw);
  if (!parsed.success) {
    say(
      `frame-index.json is not a frame index: ${parsed.error.issues[0]?.message ?? "unknown problem"}`,
    );
    return { problems };
  }
  const index = parsed.data;

  for (const frame of index.frames) {
    const named = `${frame.id} (${frame.name})`;

    if (!ID_PATTERN.test(frame.id)) {
      // The manifest schema allows any string, and Card Anvil turns an id into
      // a filename. A gallery must not be the thing that hands it a bad one.
      say(`${named}: id must be reverse-DNS, lower case`);
    }
    if (BUILTIN_FRAME_IDS.includes(frame.id)) {
      say(`${named}: that id belongs to a frame Card Anvil already ships`);
    }
    if (!frame.license.trim()) {
      say(`${named}: needs a license`);
    }
    if (!frame.author.name.trim()) {
      say(`${named}: needs an author`);
    }
    if (frame.bundle.bytes > MAX_BUNDLE_BYTES) {
      say(
        `${named}: the bundle is larger than Card Anvil will open (${String(MAX_BUNDLE_BYTES / 1024 / 1024)} MB)`,
      );
    }

    const compatibility = isContractCompatible(frame.contractVersion);
    if (!compatibility.ok) {
      say(`${named}: ${compatibility.reason ?? "unsupported frame format"}`);
    }

    // A listing points at an author's own releases and nowhere else. Without
    // this, an entry could name one repository and serve bytes from another.
    for (const [what, url] of [
      ["bundle", frame.bundle.url],
      ["preview", frame.preview.url],
    ] as const) {
      if (url === undefined) {
        say(
          `${named}: the index has no ${what} URL — build with --repository and --tag`,
        );
      } else if (!url.startsWith(releasePrefix(repository))) {
        say(`${named}: its ${what} is not published by ${repository}`);
      }
    }
  }

  return { problems, index };
}

/** Which repository, if any, already claims each frame id. */
export function checkIdCollisions(
  indexes: { repository: string; file: string; index: FrameIndex }[],
): Problem[] {
  const owner = new Map<string, string>();
  const problems: Problem[] = [];

  for (const { repository, file, index } of indexes) {
    for (const frame of index.frames) {
      const claimed = owner.get(frame.id);
      if (claimed !== undefined && claimed !== repository) {
        problems.push({
          file,
          message: `${frame.id} is already listed by ${claimed}. An id may only belong to one repository`,
        });
        continue;
      }
      owner.set(frame.id, repository);
    }
  }

  return problems;
}

/** The one place an entry file is allowed to live. */
export function checkEntryPath(repository: string, file: string): Problem[] {
  const expected = entryPathFor(repository);
  return file === expected
    ? []
    : [{ file, message: `an entry for ${repository} belongs at ${expected}` }];
}
