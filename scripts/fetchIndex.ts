import { latestIndexUrl } from "@cardanvil/frame-kit/packaging";

/** How long any one request may take before it counts as unreachable. */
const TIMEOUT_MS = 20_000;
const ATTEMPTS = 3;

export interface FetchedIndex {
  repository: string;
  url: string;
  raw?: unknown;
  error?: string;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function once(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`HTTP ${String(response.status)}`);
  }
  return await response.json();
}

const INDEX_FILENAME = "frame-index.json";

export interface ReleaseSummary {
  draft: boolean;
  prerelease: boolean;
  assets: { name: string; browser_download_url: string }[];
}

/**
 * The newest release carrying an index, from a newest-first list.
 *
 * Skipping releases without one is the whole point: a repository may publish
 * other things to the same releases page, and those must not be mistaken for
 * a frame release.
 */
export function pickIndexAsset(
  releases: readonly ReleaseSummary[],
): string | undefined {
  for (const release of releases) {
    if (release.draft || release.prerelease) {
      continue;
    }
    const asset = release.assets.find((a) => a.name === INDEX_FILENAME);
    if (asset) {
      return asset.browser_download_url;
    }
  }
  return undefined;
}

/**
 * The newest release that actually carries an index, via the REST API.
 *
 * The fast path below assumes `releases/latest` is a frame release, and that
 * is not always true: a repository may publish other things too. Card Anvil's
 * own frames repository publishes `frame-kit` to the same releases page, and
 * GitHub resolves `releases/latest` to whichever non-prerelease release is
 * newest when none is explicitly marked — so a package release can hold the
 * slot the download URL depends on.
 *
 * Only reached when the fast path fails, and only in CI, where `GITHUB_TOKEN`
 * lifts the rate limit. The app never does any of this; it reads the aggregate.
 */
async function findIndexAsset(repository: string): Promise<string | undefined> {
  const token = process.env.GITHUB_TOKEN;
  const response = await fetch(
    `https://api.github.com/repos/${repository}/releases?per_page=30`,
    {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        accept: "application/vnd.github+json",
        ...(token === undefined ? {} : { authorization: `Bearer ${token}` }),
      },
    },
  );
  if (!response.ok) {
    return undefined;
  }

  return pickIndexAsset((await response.json()) as ReleaseSummary[]);
}

/**
 * A repository's current index.
 *
 * Tries `releases/latest/download/...` first: it needs no API call and no
 * token, so it is not subject to GitHub's unauthenticated rate limit. Falls
 * back to asking which release actually has an index, because that URL only
 * works for a repository whose latest release is a frame release.
 *
 * Retried, because one flaky request should not drop a frame from the gallery.
 */
export async function fetchIndex(repository: string): Promise<FetchedIndex> {
  const url = latestIndexUrl(repository);
  let last = "";

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      return { repository, url, raw: await once(url) };
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
      if (attempt < ATTEMPTS) {
        await wait(attempt * 1000);
      }
    }
  }

  const fallback = await findIndexAsset(repository).catch(() => undefined);
  if (fallback !== undefined) {
    try {
      return { repository, url: fallback, raw: await once(fallback) };
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
  }

  return { repository, url, error: last };
}

/**
 * Whether a download URL is really there, without downloading it.
 *
 * A bundle URL that 404s is an install button that fails after the user has
 * already decided they want the frame.
 */
export async function checkReachable(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.ok ? undefined : `HTTP ${String(response.status)}`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
