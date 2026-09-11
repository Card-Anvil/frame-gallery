import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { ENTRY_SCHEMA_FILE, entryJsonSchema, serialise } from "./schema.ts";

test("the committed JSON Schema matches the one entries are parsed with", async () => {
  // Editors check submissions against the committed file; the scripts check
  // them against the zod schema. If those drift, a submission can pass in an
  // editor and fail in CI, which is the worst way to learn the rules.
  assert.equal(
    await readFile(ENTRY_SCHEMA_FILE, "utf8"),
    serialise(entryJsonSchema()),
    "run `pnpm schema` to regenerate it",
  );
});
