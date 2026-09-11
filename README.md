# Card Anvil frame gallery

The list of repositories whose frames appear in Card Anvil's **Frame Gallery**.

This repository holds no frame art. Each entry names a repository; everything
shown in the app — names, descriptions, tags, layouts, previews, checksums —
comes from that repository's own release. Your frames stay yours: you publish
them, you update them, and deleting your release removes them from the gallery.

## Listing your frames

1. **Publish a release.** If you started from
   [frame-template](https://github.com/Card-Anvil/frame-template), that is
   **Actions → Release frames → Run workflow**. It builds a `.cardframe` per
   frame plus a `frame-index.json` describing the set, which is the file this
   gallery reads.
2. **Add one file** at `repositories/<your-owner>/<your-repo>.json`, lower case:

   ```json
   {
     "$schema": "../../schema/gallery-entry.schema.json",
     "repository": "octocat/my-frames",
     "submittedBy": "octocat",
     "addedAt": "2026-09-11"
   }
   ```

3. **Open a pull request.** CI checks your release and comments what it would
   list. Once it is merged, the gallery refreshes and your frames appear in the
   app within a few hours.

That is the whole submission. You never edit `gallery.json` — it is generated.

## What is checked

Every rule exists to stop a listing that would fail in someone's app:

| Check                                             | Why                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| The index fetches and parses                      | An entry pointing at a repository with no release is a dead listing  |
| Every bundle really downloads                     | A 404 is an install button that fails after the user has chosen      |
| Ids are reverse-DNS, e.g. `com.example.parchment` | Card Anvil stores an id and uses it as a filename                    |
| No two repositories claim one id                  | An id is how the app knows what is installed and what needs updating |
| No id Card Anvil already ships                    | A built-in frame can never be replaced                               |
| Bundles and previews come from your own releases  | A listing must not name one repository and serve bytes from another  |
| Every frame has a licence and an author           | People deserve to know what they are installing and under what terms |
| The bundle is one the app will open               | Refusing at 512 MB here beats failing on someone's machine           |

## How people see it

In Card Anvil: the **frame button in the title bar**, then **Browse**. Your
preview, name, description, version, licence and layouts come straight from your
index, so what you write there is what people read.

What the button under it does depends on where the app is running:

- **Desktop** — one click. The app downloads your bundle, checks it against the
  size and checksum your index gave, verifies every file inside it, and installs
  it. It can also see that an installed frame is out of date and offer
  **Update**, which is what the version in your manifest is for.
- **Web** — a plain download link to your release, because a browser may
  download a release asset but may not read its bytes. The file installs by drag
  and drop, or by double-clicking it once the desktop app is installed.

Either way the bytes come from your release; nothing is copied here.

## After you are listed

Nothing. Release a new version and the gallery picks it up on its next refresh;
the app then offers it as an update to anyone who installed the old one.

If your repository stops answering, your frames stay listed for about a week so
a brief outage costs you nothing. After that they are dropped until it works
again.

## Removing a listing

Delete your entry file and open a pull request, or
[open an issue](../../issues/new/choose) if you cannot. Frames already installed
on someone's machine stay installed — this only removes the listing.

## Reporting a frame

Listing is review, not endorsement. A frame in this gallery is published by
whoever owns that repository, and Card Anvil does not vet its art or its
licensing. If something here infringes your rights or is malicious, please
[open an issue](../../issues/new/choose).
