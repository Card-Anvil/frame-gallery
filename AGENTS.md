# AGENTS.md

Guide for coding agents working in this repo. Humans should read
[README.md](README.md) first — this file covers the conventions an agent needs
and does not repeat the submission guide.

## What this is

The list of repositories whose frames appear in Card Anvil's Frame Gallery.
**No frame art lives here.** Each entry names a repository; a scheduled job
fetches each one's `frame-index.json` and merges them into `gallery.json`, which
Card Anvil reads.

| Repo                                                                      | Role                                                                                                            |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| [Card-Anvil/frames](https://github.com/Card-Anvil/frames)                 | The frame contract and the frames built into the app. **Never listed here** — those frames ship with Card Anvil |
| [Card-Anvil/frame-template](https://github.com/Card-Anvil/frame-template) | What an author starts from                                                                                      |
| This repo                                                                 | Which repositories the gallery shows                                                                            |

## Commands

| Task                         | Command                     |
| ---------------------------- | --------------------------- |
| Install                      | `pnpm install`              |
| Check every listing          | `pnpm validate`             |
| Rebuild `gallery.json`       | `pnpm aggregate`            |
| Write an entry from an issue | `pnpm submit`               |
| Test                         | `pnpm test`                 |
| Typecheck                    | `pnpm typecheck`            |
| Lint / format                | `pnpm lint` / `pnpm format` |

Node 24+, pnpm. Scripts are TypeScript run through Node's type stripping — no
build step.

## Conventions

- **One file per repository**, at `repositories/<owner>/<name>.json`, lower
  case. Not one array: two people submitting on the same day must not conflict,
  and a single list guarantees they would.
- **An entry names a repository and nothing else.** Everything displayable
  already exists in that repository's index, written by the tool that built the
  frames. Copying any of it here would be a second version to keep true.
- **Rules are pure functions** in `scripts/checks.ts` and `scripts/gallery.ts`,
  tested against recorded data with no network. Fetching lives in
  `scripts/fetchIndex.ts`. Keep that split — it is what makes the rules testable.
- **Parse indexes with `@cardanvil/frame-kit`'s own schema**, never a local
  re-declaration. It imports Vite dynamically, so it works in plain Node.
- `gallery.json` is **generated**. Never hand-edit it; run `pnpm aggregate`.

## Listing from an issue

A submitter may either open the pull request themselves or
[open a listing issue](.github/ISSUE_TEMPLATE/list-my-frames.yml) and let a
maintainer do it: **Actions → Open a listing pull request → Run workflow**, with
the issue number. It reads the issue, writes the entry, opens the pull request
and says so on the issue. `workflow_dispatch` already requires write access, so
that is the whole of the access control.

The reading is `scripts/issue.ts` — pure, tested, and the only thing that
interprets what a submitter typed. The workflow supplies the issue and runs git
and `gh`; it parses nothing itself.

It opens the pull request as a **GitHub App**, which needs two settings on this
repository:

| Name                      | Kind     | Value                                          |
| ------------------------- | -------- | ---------------------------------------------- |
| `LISTING_APP_CLIENT_ID`   | variable | The app's client id, which is not secret       |
| `LISTING_APP_PRIVATE_KEY` | secret   | The whole `.pem`, `BEGIN`/`END` lines included |

The app needs **Contents: write**, **Pull requests: write** and **Issues:
write**, and to be installed here. It can be the same app the frames repository
releases with — installing it here and copying the two settings over is the
whole of it. Not `GITHUB_TOKEN`: a pull request opened with that token starts no
other workflow, so Validate would never run on it, and a listing nobody checked
is exactly what must not be merged. Not a personal token either — that expires,
belongs to a person, and needs the organisation to approve it.

## Things that are easy to get wrong

- **`releases/latest/download/...` is not always the frame release.** A
  repository may publish other things to the same releases page, and GitHub
  resolves `latest` to whichever non-prerelease release is newest when none is
  explicitly marked. `fetchIndex` falls back to asking which release actually
  carries a `frame-index.json`; `pickIndexAsset` is that rule, with a test.
- **A failing repository keeps its frames** for `FAILURES_BEFORE_DROPPING`
  refreshes. Removing them on the first failure would empty the gallery over a
  blip.
- **`lastSucceededAt` is only written while a source is failing.** For a healthy
  one it would repeat `lastCheckedAt`, making every refresh a change and so a
  commit, four times a day, saying nothing.
- **Aggregation re-runs the submission checks.** A repository can publish a
  release that breaks them after it was listed.
- **Nothing is re-hosted, deliberately.** `gallery.json` carries URLs to the
  author's own release for both the bundle and the preview. Re-hosting previews
  here was considered and rejected: Card Anvil's `img-src` allows
  `https://github.com` and `https://*.githubusercontent.com`, which already
  covers the redirect a release download performs — including GitHub's past move
  from `objects.` to `release-assets.githubusercontent.com`, which happened
  inside that wildcard. Re-hosting would trade one line of CSP for repository
  growth that git history never gives back.

## Before you commit

`pnpm install` installs a husky pre-commit hook that runs what the `validate` workflow runs, minus
two steps: lint-staged fixes and formats the staged files, then `pnpm typecheck`. The tests and
`pnpm validate` stay on the PR — `validate` fetches every listed repository, and a commit should
not need the network.

To commit past it — a work-in-progress commit on a branch, say — use `git commit --no-verify`.
CI still has the final word.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
Imperative mood, lower case, no trailing period. One logical change per commit.
The default branch is `main`.
