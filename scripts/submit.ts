import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { entryJson, listingIssueFrom, submissionFromIssue } from "./issue.ts";

/**
 * Writes the entry file a listing issue asks for.
 *
 * The half of "turn this issue into a pull request" that needs no token: it
 * reads the JSON the workflow fetched with `gh issue view`, writes one file,
 * and says what it wrote. Branching, committing and opening the pull request
 * are git and `gh`, which the workflow already knows how to drive.
 */
async function main(): Promise<void> {
  const number = Number(process.env.ISSUE_NUMBER);
  const file = process.env.ISSUE_FILE ?? "issue.json";

  if (!Number.isInteger(number) || number <= 0) {
    return fail("ISSUE_NUMBER must be an issue number");
  }

  const raw: unknown = JSON.parse(await readFile(file, "utf8"));
  const read = listingIssueFrom(number, raw);
  if (!read.ok) {
    return fail(read.problem);
  }

  const today = new Date().toISOString().slice(0, 10);
  const submission = submissionFromIssue(read.issue, today);
  if (!submission.ok) {
    return fail(submission.problem);
  }

  const { entry, file: entryFile, branch } = submission;
  const absolute = path.join(process.cwd(), entryFile);
  if (existsSync(absolute)) {
    // Not something the workflow can fix, and not worth a pull request:
    // whoever opened the issue is asking for something already there.
    return fail(`${entry.repository} is already listed, at \`${entryFile}\``);
  }

  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, entryJson(entry), "utf8");

  await output({
    repository: entry.repository,
    file: entryFile,
    branch,
    author: read.issue.author,
  });
  console.log(`Wrote ${entryFile} for ${entry.repository}.`);
}

/** Says why, everywhere a maintainer might look, and stops. */
async function fail(problem: string): Promise<void> {
  console.error(problem);
  await output({ problem });
  await summarise(`**Nothing was opened.** ${problem}`);
  process.exit(1);
}

/**
 * Step outputs, in the delimited form that survives any value.
 *
 * The delimiter is random per run because one of these values quotes what
 * somebody typed into the issue. A fixed delimiter a submitter can guess is a
 * submitter who can forge every other output.
 */
async function output(values: Record<string, string>): Promise<void> {
  const file = process.env.GITHUB_OUTPUT;
  if (file === undefined) {
    return;
  }
  const end = `__SUBMIT_${randomUUID()}__`;
  const lines = Object.entries(values).map(
    ([key, value]) => `${key}<<${end}\n${value}\n${end}`,
  );
  await appendFile(file, `${lines.join("\n")}\n`);
}

async function summarise(markdown: string): Promise<void> {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file !== undefined) {
    await appendFile(file, `${markdown}\n`);
  }
}

await main();
