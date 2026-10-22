# git-batch config

Each batch creates one commit with only the paths it stages.

## Fields

| Field | Required | Description |
| --- | --- | --- |
| `batches` | yes | Ordered commits |
| `exclude` | no | Extra paths the script will not stage. Globs use `*` (one segment) and `**` (any depth). A pattern without `*` also matches the basename |
| `batches[].id` | no | Label printed in the log |
| `batches[].message` | yes | Full commit message. The first line is the subject. Text after the first newline is the body |
| `batches[].files` | no | Paths to `git add`. Relative to the git root, or relative to this JSON file when they start with `./` or `../` |
| `batches[].insertLines` | no | Insert lines into an existing file before staging. Idempotent with `skipIfIncludes` |
| `batches[].cachedPatches` | no | Paths to patches applied with `git apply --cached` |
| `batches[].skipIfEmpty` | no | Skip the commit when nothing is staged. Default `true` |

Built-in excludes, always on: `firebase-debug.log`, `firestore-debug.log`, `ui-debug.log`, `pubsub-debug.log`, `database-debug.log`.

## Path rules

- `src/app.ts` resolves from the git root. If that path does not exist, the script also checks next to the JSON file.
- `../../src/app.ts` always resolves from the JSON file's directory. Use this form for a deletion, because a missing file cannot be discovered by existence checks.
- A path that resolves outside the repository is an error.
- A missing path inside the repository is staged as a deletion.

## insertLines

```json
{
  "file": "CHANGELOG.md",
  "insertAfter": "|------|----------|",
  "lines": ["| 2026-10-22 | fix: summary |"],
  "skipIfIncludes": "fix: summary"
}
```

- `insertAfter` inserts after the first line that contains the substring.
- `insertBefore` inserts before the first line that contains the substring.
- `skipIfIncludes` skips the whole insertion when the file already contains the substring.
- Lines that are already present are not inserted again.
- The file's existing newline (`\n` or `\r\n`) is preserved.

Do not point several batches at the same index line unless each one uses a distinct `skipIfIncludes`. If the index was edited by hand before the run, either restore it and let `insertLines` rebuild it, or put the whole index file in one final batch.

## Commands

```bash
node .cursor/skills/git-batch/scripts/git-batch-commit.mjs --config scripts/commit-batches/example.json --dry-run
node .cursor/skills/git-batch/scripts/git-batch-commit.mjs --config scripts/commit-batches/topic.json
node .cursor/skills/git-batch/scripts/git-batch-commit.mjs --config scripts/commit-batches/topic.json --only 2,3
```

`--only` and `--from` cannot be combined. `--from 2` runs batch 2 through the end. Numbers are 1-based positions in `batches`, not the `id` string.

## Limits

- One batch is one `git commit`. Partial hunks require `cachedPatches`, not an interactive `git add -p`.
- Commits already on the branch are not reordered.
- `--dry-run` prints the git commands and does not write files or create commits.
