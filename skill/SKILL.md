---
name: git-batch
description: >-
  Split uncommitted working-tree changes into focused git commits with
  git-batch-commit.mjs and a JSON batch config. Use when the user runs
  /git-batch, asks to batch commits, split one dirty tree into several
  commits, plan a commit series, or says "commits por lotes" or "git batch".
---

# Git batch

Turn the dirty working tree into several focused commits. One batch is one commit. Do not rewrite history, push, or commit until the user explicitly asks for a real run.

## Engine

Run from any directory inside the target repository. Use the first script that exists:

1. `.cursor/skills/git-batch/scripts/git-batch-commit.mjs`
2. `.claude/skills/git-batch/scripts/git-batch-commit.mjs`
3. `.agents/skills/git-batch/scripts/git-batch-commit.mjs`
4. `scripts/git-batch-commit.mjs`

If the repo defines `pnpm git:batch` or `npm run git:batch`, use that wrapper with the same arguments.

```bash
node <script> --config scripts/commit-batches/<topic>.json --dry-run
node <script> --config scripts/commit-batches/<topic>.json
node <script> --config scripts/commit-batches/<topic>.json --from 2
node <script> --config scripts/commit-batches/<topic>.json --only 1,3
```

On PowerShell, pass arguments directly. Do not insert an extra `--` unless the package manager requires it (`pnpm git:batch -- --config ...`).

If none of the scripts exist, stop and tell the user to install the skill. Do not replace the tool with a hand-rolled `git add` / `git commit` loop.

## Workflow

1. Read `git status --short`, `git diff`, and `git log -8 --oneline`. Match the repository's commit style. If `CONTRIBUTING.md` or `AGENTS.md` defines commits or a changelog, follow that.
2. Group changes by one reason each (`fix`, `feat`, `docs`, `refactor`, `test`, `chore`). Leave unrelated files for a later batch or out of the plan.
3. Write `scripts/commit-batches/<topic>.json`. Start from [templates/example.json](templates/example.json). Field reference: [templates/schema.md](templates/schema.md).
4. Paths in `files` are relative to the git root (`src/app.ts`) or to the JSON file (`../../src/app.ts`). Prefer git-root paths in new configs.
5. Run `--dry-run`. Show a table: number, id, subject, files. Print the exact command the user can copy.
6. Create real commits only after an explicit request to run without `--dry-run`.
7. Finish with `git log -5 --oneline` and `git status --short`.

## Rules

- Never stage `.env`, credentials, keys, tokens, or `*-debug.log`.
- Never `git push`, `git reset --hard`, rebase, amend, or `--no-verify`.
- Do not commit when the dry-run failed.
- `exclude` and the built-in debug-log names are skipped even if listed in `files`.
- A missing file that is still tracked is a deletion. The script stages it with `git add`.
- `insertLines` is idempotent when `skipIfIncludes` is set. Re-runs skip that insertion.
- `cachedPatches` applies `git apply --cached` for a partial hunk. The patch file must exist.
- This tool does not reorder commits already on the branch.

## Minimum config

```json
{
  "exclude": ["**/*-debug.log"],
  "batches": [
    {
      "id": "1-fix-upload",
      "message": "fix(upload): short imperative summary\n\nWhy this change is separate.",
      "files": ["src/upload.ts", "src/upload.test.ts"]
    }
  ]
}
```

## Report after dry-run

| # | id | subject | files |
| --- | --- | --- | --- |
| 1 | 1-fix-upload | fix(upload): short imperative summary | `src/upload.ts`, `src/upload.test.ts` |

Then the copy-paste command for the real run, and wait.
