import { appendFile } from "node:fs/promises";

import type { FrameIndex } from "@cardanvil/frame-kit/packaging";

import {
  type Problem,
  checkEntryPath,
  checkIdCollisions,
  checkIndex,
} from "./checks.ts";
import { loadEntries } from "./entry.ts";
import { checkReachable, fetchIndex } from "./fetchIndex.ts";

/**
 * Checks every listed repository, and says what is wrong in terms a submitter
 * can act on.
 *
 * Run on every pull request. Deliberately needs no token: everything it reads
 * is a public, unauthenticated GET, so it is safe to run on a fork's code.
 */
async function main(): Promise<void> {
  const root = process.cwd();
  const entries = await loadEntries(root);
  const problems: Problem[] = [];
  const resolved: { repository: string; file: string; index: FrameIndex }[] =
    [];
  const listed: string[] = [];

  for (const { entry, file } of entries) {
    problems.push(...checkEntryPath(entry.repository, file));

    const fetched = await fetchIndex(entry.repository);
    if (fetched.raw === undefined) {
      problems.push({
        file,
        message: `could not read ${fetched.url}: ${fetched.error ?? "unknown error"}. Has this repository published a release?`,
      });
      continue;
    }

    const { problems: found, index } = checkIndex(
      entry.repository,
      file,
      fetched.raw,
    );
    problems.push(...found);
    if (!index) {
      continue;
    }
    resolved.push({ repository: entry.repository, file, index });

    for (const frame of index.frames) {
      listed.push(`${frame.name} \`${frame.id}\` ${frame.version}`);
      // Cheap, and it catches the common case of a release whose assets were
      // deleted. The bundle itself is never downloaded here.
      const url = frame.bundle.url;
      if (url !== undefined) {
        const unreachable = await checkReachable(url);
        if (unreachable !== undefined) {
          problems.push({
            file,
            message: `${frame.id}: its bundle is not downloadable (${unreachable})`,
          });
        }
      }
    }
  }

  problems.push(...checkIdCollisions(resolved));

  await summarise(entries.length, listed, problems);

  if (problems.length > 0) {
    for (const { file, message } of problems) {
      console.error(`${file}: ${message}`);
    }
    console.error(`\n${String(problems.length)} problem(s).`);
    process.exit(1);
  }
  console.log(
    `${String(entries.length)} repositories, ${String(listed.length)} frames, nothing wrong.`,
  );
}

/** Writes what a submitter most wants to see: what their PR would list. */
async function summarise(
  repositories: number,
  listed: string[],
  problems: Problem[],
): Promise<void> {
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary === undefined) {
    return;
  }

  const lines = ["## Frame gallery", ""];
  if (problems.length > 0) {
    lines.push(`### ${String(problems.length)} problem(s)`, "");
    for (const { file, message } of problems) {
      lines.push(`- \`${file}\` — ${message}`);
    }
    lines.push("");
  }
  lines.push(
    `${String(repositories)} repositories listing ${String(listed.length)} frames:`,
    "",
    ...listed.map((f) => `- ${f}`),
    "",
  );
  await appendFile(summary, lines.join("\n"));
}

await main();
