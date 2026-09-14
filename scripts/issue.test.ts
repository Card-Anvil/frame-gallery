import assert from "node:assert/strict";
import { test } from "node:test";

import {
  listingIssueFrom,
  parseIssueForm,
  repositoryFromLink,
  submissionFromIssue,
} from "./issue.ts";

/** What GitHub writes for the “List my frames” form. */
function body(link: string): string {
  return [
    "### Link to your repository",
    "",
    link,
    "",
    "### Checklist",
    "",
    "- [X] My repository has a published release containing `frame-index.json`",
    "- [ ] Every frame has a licence I have the right to publish under",
    "",
  ].join("\n");
}

const issue = (link: string) => ({
  number: 7,
  body: body(link),
  author: "octocat",
});

test("an issue form reads back as its fields", () => {
  const fields = parseIssueForm(body("https://github.com/octocat/my-frames"));
  assert.equal(
    fields.get("Link to your repository"),
    "https://github.com/octocat/my-frames",
  );
  assert.match(fields.get("Checklist") ?? "", /^- \[X\]/);
});

test("an input left empty reads as empty, not as its placeholder text", () => {
  const fields = parseIssueForm(
    "### Link to your repository\n\n_No response_\n",
  );
  assert.equal(fields.get("Link to your repository"), "");
});

test("carriage returns do not end up in a field", () => {
  const fields = parseIssueForm("### Which\r\n\r\nocto\r\n");
  assert.equal(fields.get("Which"), "octo");
});

test("every shape a repository gets written in names the same repository", () => {
  for (const written of [
    "https://github.com/octocat/my-frames",
    "http://github.com/octocat/my-frames",
    "https://www.github.com/octocat/my-frames/",
    "https://github.com/octocat/my-frames.git",
    "https://github.com/octocat/my-frames/tree/main",
    "<https://github.com/octocat/my-frames>",
    "`octocat/my-frames`",
    "github.com/octocat/my-frames",
    "octocat/my-frames",
    "  https://github.com/octocat/my-frames  ",
  ]) {
    assert.equal(repositoryFromLink(written), "octocat/my-frames", written);
  }
});

test("something that is not a repository is not guessed at", () => {
  for (const written of [
    "",
    "octocat",
    "https://github.com/octocat",
    "https://example.com/octocat/my-frames",
    "my frames",
    "https://github.com/-octocat/my-frames",
  ]) {
    assert.equal(repositoryFromLink(written), undefined, written);
  }
});

test("a filled-in issue becomes the entry it asks for", () => {
  const result = submissionFromIssue(
    issue("https://github.com/Octocat/My-Frames"),
    "2026-09-13",
  );
  assert.ok(result.ok);
  assert.deepEqual(result.entry, {
    $schema: "../../schema/gallery-entry.schema.json",
    repository: "Octocat/My-Frames",
    submittedBy: "octocat",
    addedAt: "2026-09-13",
  });
  // The file and the branch are lower case even when the link was not.
  assert.equal(result.file, "repositories/octocat/my-frames.json");
  assert.equal(result.branch, "listing/octocat/my-frames");
});

test("the repository field is found however the form words its label", () => {
  const result = submissionFromIssue(
    {
      number: 1,
      body: "### Which repository\n\noctocat/my-frames\n",
      author: "octocat",
    },
    "2026-09-13",
  );
  assert.ok(result.ok);
  assert.equal(result.entry.repository, "octocat/my-frames");
});

test("an issue that is not a listing says so instead of guessing", () => {
  const result = submissionFromIssue(
    { number: 1, body: "I cannot install anything.", author: "octocat" },
    "2026-09-13",
  );
  assert.ok(!result.ok);
  assert.match(result.problem, /no repository field/);
});

test("a link that names no repository is refused with what was written", () => {
  const result = submissionFromIssue(issue("my cool frames"), "2026-09-13");
  assert.ok(!result.ok);
  assert.match(result.problem, /my cool frames/);
});

test("an empty repository field is refused", () => {
  const result = submissionFromIssue(issue("_No response_"), "2026-09-13");
  assert.ok(!result.ok);
  assert.match(result.problem, /names no repository/);
});

/** What `gh issue view --json body,author,state` writes. */
function viewed(overrides: Record<string, unknown> = {}) {
  return {
    body: body("https://github.com/octocat/my-frames"),
    author: { login: "octocat" },
    state: "OPEN",
    ...overrides,
  };
}

test("an open issue reads back as the listing it is", () => {
  const read = listingIssueFrom(7, viewed());
  assert.ok(read.ok);
  assert.equal(read.issue.author, "octocat");
  assert.equal(read.issue.number, 7);
});

test("an issue a maintainer already closed is left alone", () => {
  const read = listingIssueFrom(7, viewed({ state: "CLOSED" }));
  assert.ok(!read.ok);
  assert.match(read.problem, /#7 is closed/);
});

test("JSON that is not an issue is refused rather than half-read", () => {
  const read = listingIssueFrom(7, { message: "Not Found" });
  assert.ok(!read.ok);
  assert.match(read.problem, /not an issue/);
});

test("a body cannot smuggle in a step output delimiter", () => {
  // `submit` writes outputs with a random delimiter for exactly this; the
  // parser itself must at least not lose the text.
  const read = listingIssueFrom(
    7,
    viewed({ body: "### Link to your repository\n\n__SUBMIT_EOF__\nfoo=bar" }),
  );
  assert.ok(read.ok);
  const result = submissionFromIssue(read.issue, "2026-09-13");
  assert.ok(!result.ok);
  assert.match(result.problem, /not a link to a GitHub repository/);
});
