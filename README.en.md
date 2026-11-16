# git-batch

[English](README.en.md) | [Español](README.md)

Split a dirty working tree into focused commits. One JSON batch becomes one `git commit`. The agent plans the batches. The script stages exactly the listed paths and commits them. Nothing is pushed and existing history is left alone.

## What it does

The working tree stays untouched until you confirm. The flow:

1. The agent reads `git status`, `git diff` and the style of `git log`.
2. It writes a JSON file with one batch per commit.
3. The engine runs `--dry-run` and shows a table.
4. If you ask for it, each batch runs `git add` on its paths and one `git commit`.

It does not reorder existing commits, run interactive `git add -p`, or push.

Engine details are in [HOW-IT-WORKS.md](HOW-IT-WORKS.md).

## Install in a repository

Requires Git and Node.js 18+.

From the target repo root (Windows / PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File C:\path\to\git-batch\install.ps1 -Target .
```

Linux and macOS:

```bash
./install.sh --target /path/to/repo
./install.sh --scope user
```

This copies the skill to:

| Tool | Path |
| --- | --- |
| Cursor | `.cursor/skills/git-batch/` |
| Cursor, `/git-batch` command | `.cursor/commands/git-batch.md` |
| Claude Code | `.claude/skills/git-batch/` |
| Agents | `.agents/skills/git-batch/` |

It also creates `scripts/commit-batches/example.json` if missing. It does not touch `package.json`.

Optional shortcut script:

```json
{
  "scripts": {
    "git:batch": "node .cursor/skills/git-batch/scripts/git-batch-commit.mjs"
  }
}
```

```bash
pnpm git:batch -- --config scripts/commit-batches/<topic>.json --dry-run
npm run git:batch -- --config scripts/commit-batches/<topic>.json --dry-run
```

Without a package manager:

```bash
node .cursor/skills/git-batch/scripts/git-batch-commit.mjs --config scripts/commit-batches/<topic>.json --dry-run
```

To update the skill, rerun the installer. An existing Cursor command is not overwritten.

### User-level install

A single copy serves every repo on the machine. The script still operates on the git root of the directory where you run it.

```powershell
powershell -ExecutionPolicy Bypass -File C:\path\to\git-batch\install.ps1 -Scope User
```

It lands in `%USERPROFILE%\.cursor\skills\git-batch`, plus equivalent copies for Claude Code and `.agents`.

### Manual copy

Copy `skill/` to `.cursor/skills/git-batch/` (and to `.claude/skills/git-batch/` or `.agents/skills/git-batch/` if you use those tools). Copy `commands/git-batch.md` to `.cursor/commands/git-batch.md`.

Commit those folders if your team should share the skill. Don't commit JSON files in `scripts/commit-batches/` that describe unfinished work, unless you want to keep the plan as history.

## Usage

In chat:

```text
/git-batch
```

If the slash command isn't loaded:

```text
Use the git-batch skill. Review my local changes, group by domain,
write scripts/commit-batches/<topic>.json, run a dry-run and show me the table.
Do not make real commits until I confirm.
```

Useful requests:

| Goal | What to say |
| --- | --- |
| New plan | Plan git-batch for the changes on this branch |
| One domain | Batch only the auth files. Ignore the rest |
| Review the JSON | Review scripts/commit-batches/my-topic.json before the dry-run |
| Execute | Run git-batch with that config, no dry-run |
| One batch | Run only batch 2 with --only 2 |

Before the real run: the dry-run finished without errors, messages match `git log`, and no secrets are in `files`.

## Minimal JSON

```json
{
  "exclude": ["**/*-debug.log", ".env", ".env.local"],
  "batches": [
    {
      "id": "1-fix-upload",
      "message": "fix(upload): imperative summary\n\nWhy this change stands alone.",
      "files": ["src/upload.ts", "src/upload.test.ts"]
    }
  ]
}
```

Paths in `files` are relative to the repo root. Paths relative to the JSON file (`../../src/upload.ts`) also work.

Fields, `insertLines` and `cachedPatches`: [skill/templates/schema.md](skill/templates/schema.md). Template: [skill/templates/example.json](skill/templates/example.json).

## Safety

The agent must not list `.env`, keys, tokens or debug logs. The engine also always ignores these names:

- `firebase-debug.log`
- `firestore-debug.log`
- `ui-debug.log`
- `pubsub-debug.log`
- `database-debug.log`

`exclude` is also enforced even if the path appears in `files`. A path resolving outside the repository aborts the run.

A real run creates local commits. Review them with `git log` and `git status` before pushing.

## Development

```powershell
npm test
```

Tests create temporary repos and don't touch your global Git config.

## License

[MIT](LICENSE)
