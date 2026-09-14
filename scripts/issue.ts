import { z } from "zod";

import { REPOSITORY_PATTERN, type Entry, entryPathFor } from "./entry.ts";

/**
 * Turning a listing issue into the pull request it asks for.
 *
 * Pure on purpose, like `checks.ts`: the workflow supplies the issue and writes
 * the file, so every rule here is testable against a recorded body with no
 * network and no repository.
 */

/** What an issue form writes for an input somebody left empty. */
const NO_RESPONSE = "_No response_";

/**
 * The fields of an issue form, by their label.
 *
 * An issue form has no machine-readable rendering — GitHub writes each answer
 * under its label as an `###` heading, and that markdown is all a workflow
 * gets. This reads it back.
 */
export function parseIssueForm(body: string): Map<string, string> {
  const fields = new Map<string, string>();
  let label: string | undefined;
  let lines: string[] = [];

  const flush = () => {
    if (label === undefined) {
      return;
    }
    const value = lines.join("\n").trim();
    fields.set(label, value === NO_RESPONSE ? "" : value);
  };

  for (const line of body.replaceAll("\r\n", "\n").split("\n")) {
    const heading = /^###\s+(.+?)\s*$/.exec(line);
    if (heading?.[1] !== undefined) {
      flush();
      label = heading[1];
      lines = [];
      continue;
    }
    lines.push(line);
  }
  flush();

  return fields;
}

/**
 * `owner/name` from however somebody wrote their repository down.
 *
 * The templates ask for a link, because that is what a browser's address bar
 * holds and what a submitter can be sure is right. What arrives is a link to
 * the repository, a link to some page inside it, or — from anyone who read the
 * older templates — the bare `owner/name`. All three name one repository.
 */
export function repositoryFromLink(input: string): string | undefined {
  const cleaned = input
    .trim()
    // Angle brackets and backticks are what a link picks up when somebody
    // pastes it into markdown; a trailing `.git` is what a clone URL carries.
    .replace(/^[<`]+|[>`]+$/g, "")
    .replace(/^https?:\/\//i, "")
    .replace(/^(?:www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");

  // `owner/name/tree/main` and friends still name `owner/name`.
  const [owner = "", name = ""] = cleaned.split("/");
  const repository = `${owner}/${name}`;

  return REPOSITORY_PATTERN.test(repository) ? repository : undefined;
}

export interface ListingIssue {
  number: number;
  body: string;
  /** The login that opened it, which is who the entry credits. */
  author: string;
}

/** What `gh issue view --json body,author,state` writes. */
const IssueViewSchema = z.object({
  body: z.string(),
  author: z.object({ login: z.string().min(1) }),
  state: z.string(),
});

/**
 * A listing issue from the JSON `gh` wrote, or why it is not one to act on.
 *
 * Reading the file rather than a step output is deliberate: an issue body is
 * whatever a stranger typed, and a workflow that passes it through
 * `$GITHUB_OUTPUT` lets a body containing the heredoc delimiter forge the
 * other outputs. Nothing untrusted should travel that way.
 */
export function listingIssueFrom(
  number: number,
  raw: unknown,
): { ok: true; issue: ListingIssue } | { ok: false; problem: string } {
  const parsed = IssueViewSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, problem: "that is not an issue `gh` could describe" };
  }
  // An issue somebody already closed is one a maintainer has dealt with.
  // Opening a pull request from it now would be a surprise.
  if (parsed.data.state !== "OPEN") {
    return {
      ok: false,
      problem: `issue #${String(number)} is ${parsed.data.state.toLowerCase()}`,
    };
  }
  return {
    ok: true,
    issue: {
      number,
      body: parsed.data.body,
      author: parsed.data.author.login,
    },
  };
}

export type Submission =
  | { ok: true; entry: Entry; file: string; branch: string }
  | { ok: false; problem: string };

/** The label matched loosely, so rewording the form does not break this. */
const REPOSITORY_FIELD = /repositor/i;

/** The entry a listing issue asks for, or why it cannot be written. */
export function submissionFromIssue(
  issue: ListingIssue,
  today: string,
): Submission {
  const fields = parseIssueForm(issue.body);
  const link = [...fields].find(([label]) => REPOSITORY_FIELD.test(label))?.[1];

  if (link === undefined) {
    return {
      ok: false,
      problem:
        "this issue has no repository field — was it opened with the “List my frames” form?",
    };
  }
  if (link === "") {
    return { ok: false, problem: "this issue names no repository" };
  }

  const repository = repositoryFromLink(link);
  if (repository === undefined) {
    return {
      ok: false,
      problem: `“${link}” is not a link to a GitHub repository. Expected something like https://github.com/octocat/my-frames`,
    };
  }

  return {
    ok: true,
    entry: {
      $schema: "../../schema/gallery-entry.schema.json",
      repository,
      submittedBy: issue.author,
      addedAt: today,
    },
    file: entryPathFor(repository),
    // Named for the repository, not the issue: a second issue asking for a
    // repository already being listed then collides with the branch that is
    // open, rather than quietly listing it twice.
    branch: `listing/${repository.toLowerCase()}`,
  };
}

/** The entry file's bytes, formatted the way Prettier would leave them. */
export function entryJson(entry: Entry): string {
  return `${JSON.stringify(entry, null, 2)}\n`;
}
