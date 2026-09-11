import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

/**
 * A submission.
 *
 * Deliberately thin: everything a gallery shows — names, descriptions, tags,
 * layouts, previews, checksums — already lives in the repository's own
 * `frame-index.json`, written by the tool that built the frames. Repeating any
 * of it here would be a second copy to keep true.
 */
export const EntrySchema = z.object({
  $schema: z.string().optional(),
  /** `owner/name` on GitHub. */
  repository: z
    .string()
    .regex(
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/,
      "must be owner/name, e.g. octocat/my-frames",
    ),
  /** Who opened the pull request, for a maintainer to follow up with. */
  submittedBy: z.string().min(1),
  /** ISO date the entry was added. */
  addedAt: z.iso.date(),
});

export type Entry = z.infer<typeof EntrySchema>;

export const ENTRIES_DIR = "repositories";

export interface LoadedEntry {
  entry: Entry;
  /** Repo-relative, POSIX, for error messages. */
  file: string;
}

/** Where an entry for `owner/name` must live. One path, derived not chosen. */
export function entryPathFor(repository: string): string {
  const [owner = "", name = ""] = repository.toLowerCase().split("/");
  return `${ENTRIES_DIR}/${owner}/${name}.json`;
}

/**
 * Every submission, in a stable order.
 *
 * One file per repository rather than one list: two people submitting on the
 * same day must not conflict, and a single array guarantees they would.
 */
export async function loadEntries(root: string): Promise<LoadedEntry[]> {
  const dir = path.join(root, ENTRIES_DIR);
  const owners = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const loaded: LoadedEntry[] = [];

  for (const owner of owners.filter((d) => d.isDirectory())) {
    const files = await readdir(path.join(dir, owner.name));
    for (const name of files.filter((f) => f.endsWith(".json")).sort()) {
      const file = `${ENTRIES_DIR}/${owner.name}/${name}`;
      const raw: unknown = JSON.parse(
        await readFile(path.join(root, file), "utf8"),
      );
      loaded.push({ entry: EntrySchema.parse(raw), file });
    }
  }

  return loaded.sort((a, b) =>
    a.entry.repository.localeCompare(b.entry.repository),
  );
}

/** The four ids this build of Card Anvil ships, which nobody else may claim. */
export const BUILTIN_FRAME_IDS: readonly string[] = [
  "com.cardanvil.m15",
  "com.cardanvil.extended",
  "com.cardanvil.borderless",
  "com.cardanvil.borderless-source-material",
];
