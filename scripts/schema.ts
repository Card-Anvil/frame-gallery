import { writeFile } from "node:fs/promises";
import { z } from "zod";

import { EntrySchema } from "./entry.ts";

export const ENTRY_SCHEMA_FILE = "schema/gallery-entry.schema.json";

/**
 * The entry format as JSON Schema, so an editor can complete and check a
 * submission before CI ever sees it.
 *
 * Generated from the zod schema rather than written by hand — two hand-kept
 * copies of one format is exactly the drift this repository exists to avoid.
 */
export function entryJsonSchema(): unknown {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Card Anvil frame gallery entry",
    ...z.toJSONSchema(EntrySchema, { target: "draft-2020-12" }),
  };
}

export function serialise(schema: unknown): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}

if (process.argv[1]?.endsWith("schema.ts") === true) {
  await writeFile(ENTRY_SCHEMA_FILE, serialise(entryJsonSchema()));
  console.log(`Wrote ${ENTRY_SCHEMA_FILE}`);
}
