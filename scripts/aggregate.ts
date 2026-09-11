import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { checkIdCollisions, checkIndex } from "./checks.ts";
import { loadEntries } from "./entry.ts";
import { fetchIndex } from "./fetchIndex.ts";
import {
  GALLERY_FILENAME,
  type Gallery,
  type Outcome,
  buildGallery,
  isSameGallery,
} from "./gallery.ts";

/**
 * Rebuilds `gallery.json` from every listed repository.
 *
 * This is the only thing that talks to those repositories. Card Anvil reads
 * the file this produces and nothing else — which is what makes browsing work
 * in a browser at all, since a GitHub release asset is not CORS-readable but
 * `raw.githubusercontent.com` is.
 */
async function main(): Promise<void> {
  const root = process.cwd();
  const target = path.join(root, GALLERY_FILENAME);
  const previous = await readGallery(target);
  const entries = await loadEntries(root);
  const outcomes: Outcome[] = [];

  for (const { entry, file } of entries) {
    const fetched = await fetchIndex(entry.repository);
    if (fetched.raw === undefined) {
      console.warn(`${entry.repository}: ${fetched.error ?? "unreadable"}`);
      outcomes.push({
        repository: entry.repository,
        indexUrl: fetched.url,
        error: fetched.error,
      });
      continue;
    }

    // The same rules a pull request had to pass. A repository can publish a
    // release that breaks them after it was listed, and that release must not
    // reach the gallery just because the listing is old.
    const { problems, index } = checkIndex(entry.repository, file, fetched.raw);
    if (!index || problems.length > 0) {
      const reason = problems[0]?.message ?? "did not pass validation";
      console.warn(`${entry.repository}: ${reason}`);
      outcomes.push({
        repository: entry.repository,
        indexUrl: fetched.url,
        error: reason,
      });
      continue;
    }

    outcomes.push({
      repository: entry.repository,
      indexUrl: fetched.url,
      index,
    });
  }

  const resolved = outcomes.flatMap((o) =>
    o.index
      ? [{ repository: o.repository, file: o.repository, index: o.index }]
      : [],
  );
  for (const { file, message } of checkIdCollisions(resolved)) {
    // First listed keeps the id; the loser is reported, not silently merged.
    console.warn(`${file}: ${message}`);
  }

  const gallery = buildGallery(outcomes, previous, new Date().toISOString());

  if (previous && isSameGallery(previous, gallery)) {
    console.log("Nothing changed.");
    await summarise(gallery, false);
    return;
  }

  await writeFile(target, `${JSON.stringify(gallery, null, 2)}\n`);
  console.log(
    `Wrote ${GALLERY_FILENAME}: ${String(gallery.frames.length)} frames from ${String(gallery.sources.length)} repositories.`,
  );
  await summarise(gallery, true);
}

async function readGallery(file: string): Promise<Gallery | undefined> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Gallery;
  } catch {
    return undefined;
  }
}

async function summarise(gallery: Gallery, changed: boolean): Promise<void> {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary === undefined) {
    return;
  }
  const unhealthy = gallery.sources.filter((s) => s.state !== "ok");
  const lines = [
    "## Frame gallery",
    "",
    changed ? "Refreshed." : "Nothing changed.",
    "",
    `${String(gallery.frames.length)} frames from ${String(gallery.sources.length)} repositories.`,
    "",
  ];
  if (unhealthy.length > 0) {
    lines.push(
      "| Repository | State | Failures | Why |",
      "| --- | --- | --- | --- |",
    );
    for (const s of unhealthy) {
      lines.push(
        `| ${s.repository} | ${s.state} | ${String(s.consecutiveFailures)} | ${s.failureReason ?? ""} |`,
      );
    }
    lines.push("");
  }
  await appendFile(summary, lines.join("\n"));
}

await main();
