/**
 * Create one git commit per JSON batch from the current working tree.
 *
 * The script can live outside the target repo (for example inside
 * .cursor/skills/git-batch). It always operates on the git root of the
 * current working directory.
 *
 * Usage:
 *   node git-batch-commit.mjs --config scripts/commit-batches/topic.json --dry-run
 *   node git-batch-commit.mjs --config scripts/commit-batches/topic.json
 *   node git-batch-commit.mjs --config scripts/commit-batches/topic.json --from 2
 *   node git-batch-commit.mjs --config scripts/commit-batches/topic.json --only 1,3
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

const DEFAULT_EXCLUDE = [
  'firebase-debug.log',
  'firestore-debug.log',
  'ui-debug.log',
  'pubsub-debug.log',
  'database-debug.log',
];

function parseArgs(argv) {
  const args = {
    config: null,
    dryRun: false,
    from: 1,
    only: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--config' || arg === '-c') {
      args.config = argv[i + 1];
      i += 1;
      if (!args.config) throw new Error('Missing value for --config');
    } else if (arg === '--from') {
      args.from = Number(argv[i + 1]);
      i += 1;
      if (!Number.isInteger(args.from) || args.from < 1) {
        throw new Error('--from must be an integer >= 1');
      }
    } else if (arg === '--only') {
      const raw = argv[i + 1];
      i += 1;
      if (!raw) throw new Error('Missing value for --only');
      args.only = raw
        .split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => Number.isInteger(n) && n >= 1);
      if (args.only.length === 0) {
        throw new Error('--only expects a comma-separated list of batch numbers');
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.only?.length && args.from !== 1) {
    throw new Error('Use either --from or --only, not both');
  }

  return args;
}

function printHelp() {
  console.log(`git-batch-commit — one commit per JSON batch

Usage:
  node git-batch-commit.mjs --config <file.json> [options]

Options:
  --dry-run          Show actions without writing files or committing
  --from <n>         Start at batch number n (1-based). Ignores earlier batches
  --only <n,m>       Run only these batch numbers (1-based)
  --help             Show this help

Paths in "files" are relative to the config file (../ allowed) or to the
git root. Run the command from anywhere inside the repository you want to
commit. --dry-run does not create commits.
`);
}

function git(repoRoot, args, { dryRun = false, allowFailure = false } = {}) {
  if (dryRun && args[0] !== 'diff' && args[0] !== 'status' && args[0] !== 'rev-parse') {
    console.log(`  [dry-run] git ${args.join(' ')}`);
    return { status: 0, stdout: '', stderr: '' };
  }

  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    shell: false,
  });

  if (result.error) {
    throw new Error(`git is not available: ${result.error.message}`);
  }

  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `git ${args.join(' ')} failed (exit ${result.status}): ${result.stderr || result.stdout}`
    );
  }

  return result;
}

function detectRepoRoot() {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: false,
  });

  if (result.error) {
    throw new Error(`git is not available: ${result.error.message}`);
  }

  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error(
      'Not inside a git repository. Run this command from the repo you want to commit.'
    );
  }

  return result.stdout.trim();
}

function gitCommit(repoRoot, message, dryRun) {
  const newline = message.indexOf('\n');
  const args =
    newline === -1
      ? ['commit', '-m', message]
      : [
          'commit',
          '-m',
          message.slice(0, newline),
          '-m',
          message.slice(newline + 1).trimEnd(),
        ];
  git(repoRoot, args, { dryRun });
}

function loadConfig(configPath, repoRoot) {
  const candidates = isAbsolute(configPath)
    ? [configPath]
    : [resolve(process.cwd(), configPath), resolve(repoRoot, configPath)];
  const abs = candidates.find((candidate) => existsSync(candidate));
  if (!abs) {
    throw new Error(`Config not found: ${candidates.join(' or ')}`);
  }

  let config;
  try {
    config = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid JSON in ${abs}: ${error.message}`);
  }

  if (!Array.isArray(config.batches) || config.batches.length === 0) {
    throw new Error('Config must define a non-empty "batches" array');
  }

  for (const [index, batch] of config.batches.entries()) {
    if (typeof batch?.message !== 'string' || batch.message.trim() === '') {
      throw new Error(`Batch ${index + 1} is missing a non-empty "message"`);
    }
  }

  return { config, abs };
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function globToRegExp(pattern) {
  const normalized = normalizePath(pattern);
  let regex = '';

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    if (char === '*') {
      if (normalized[i + 1] === '*') {
        regex += '.*';
        i += 1;
        if (normalized[i + 1] === '/') i += 1;
      } else {
        regex += '[^/]*';
      }
    } else if ('.+?^${}()|[]\\'.includes(char)) {
      regex += `\\${char}`;
    } else {
      regex += char;
    }
  }

  return new RegExp(`^${regex}$`);
}

function isExcluded(filePath, excludePatterns) {
  const normalized = normalizePath(filePath);
  const base = normalized.split('/').pop();

  return excludePatterns.some((pattern) => {
    const normalizedPattern = normalizePath(pattern);
    if (normalizedPattern.includes('*')) {
      const regex = globToRegExp(normalizedPattern);
      return regex.test(normalized) || regex.test(base);
    }
    return (
      normalized === normalizedPattern ||
      base === normalizedPattern ||
      normalized.endsWith(`/${normalizedPattern}`)
    );
  });
}

function resolveFilePath(filePath, configDir, repoRoot) {
  if (isAbsolute(filePath)) return resolve(filePath);

  const portable = filePath.replace(/\\/g, '/');
  if (portable.startsWith('./') || portable.startsWith('../')) {
    return resolve(configDir, filePath);
  }

  const fromConfig = resolve(configDir, filePath);
  if (existsSync(fromConfig)) return fromConfig;
  return resolve(repoRoot, filePath);
}

function toRepoPath(absPath, repoRoot) {
  const relPath = normalizePath(relative(repoRoot, absPath));
  if (relPath === '' || relPath.startsWith('..') || isAbsolute(relPath)) {
    throw new Error(`Path escapes the repository: ${absPath}`);
  }
  return relPath;
}

function applyInsertLines(insertLines, configDir, repoRoot, excludePatterns, dryRun) {
  const touched = [];

  for (const spec of insertLines) {
    if (typeof spec?.file !== 'string' || !Array.isArray(spec.lines)) {
      throw new Error('insertLines entries need "file" and "lines"');
    }

    const absPath = resolveFilePath(spec.file, configDir, repoRoot);
    const relPath = toRepoPath(absPath, repoRoot);
    if (isExcluded(relPath, excludePatterns)) {
      console.log(`  skip excluded insertLines: ${relPath}`);
      continue;
    }
    if (!existsSync(absPath)) {
      throw new Error(`insertLines: file not found: ${relPath}`);
    }

    const content = readFileSync(absPath, 'utf8');
    if (spec.skipIfIncludes && content.includes(spec.skipIfIncludes)) {
      console.log(`  skip insertLines (${relPath}): already includes "${spec.skipIfIncludes}"`);
      continue;
    }

    const linesToAdd = spec.lines.filter((line) => !content.includes(line));
    if (linesToAdd.length === 0) {
      console.log(`  skip insertLines (${relPath}): all lines already present`);
      continue;
    }

    const newline = content.includes('\r\n') ? '\r\n' : '\n';
    const fileLines = content.split(/\r?\n/);
    let insertAt = -1;

    if (spec.insertBefore) {
      insertAt = fileLines.findIndex((line) => line.includes(spec.insertBefore));
      if (insertAt === -1) {
        throw new Error(
          `insertLines: insertBefore anchor not found in ${relPath}: "${spec.insertBefore}"`
        );
      }
    } else if (spec.insertAfter) {
      insertAt = fileLines.findIndex((line) => line.includes(spec.insertAfter));
      if (insertAt === -1) {
        throw new Error(
          `insertLines: insertAfter anchor not found in ${relPath}: "${spec.insertAfter}"`
        );
      }
      insertAt += 1;
    } else {
      throw new Error(`insertLines (${relPath}): need insertAfter or insertBefore`);
    }

    const nextLines = [
      ...fileLines.slice(0, insertAt),
      ...linesToAdd,
      ...fileLines.slice(insertAt),
    ];
    const nextContent = nextLines.join(newline);

    console.log(`  insertLines: ${relPath} (+${linesToAdd.length} line(s))`);
    if (!dryRun) writeFileSync(absPath, nextContent, 'utf8');
    touched.push(relPath);
  }

  return touched;
}

function warnExcludedDirty(repoRoot, excludePatterns) {
  const result = git(repoRoot, ['status', '--porcelain'], { allowFailure: true });
  if (result.status !== 0) return;

  const dirtyExcluded = result.stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length >= 4)
    .map((line) => line.slice(3).replaceAll('"', '').split(' -> ').pop())
    .filter((filePath) => isExcluded(filePath, excludePatterns));

  if (dirtyExcluded.length === 0) return;

  console.warn('\nWarning: excluded files have local changes and will not be committed:');
  for (const filePath of dirtyExcluded) console.warn(`  - ${filePath}`);
  console.warn('');
}

function stageBatch(batch, configDir, repoRoot, excludePatterns, dryRun) {
  const staged = new Set();

  if (batch.insertLines?.length) {
    for (const filePath of applyInsertLines(
      batch.insertLines,
      configDir,
      repoRoot,
      excludePatterns,
      dryRun
    )) {
      staged.add(filePath);
    }
  }

  for (const file of batch.files ?? []) {
    const absPath = resolveFilePath(file, configDir, repoRoot);
    const relPath = toRepoPath(absPath, repoRoot);
    if (isExcluded(relPath, excludePatterns)) {
      console.log(`  skip excluded: ${relPath}`);
      continue;
    }
    if (!existsSync(absPath)) console.log(`  stage deletion: ${relPath}`);
    staged.add(relPath);
  }

  for (const patch of batch.cachedPatches ?? []) {
    const absPatch = resolveFilePath(patch, configDir, repoRoot);
    const relPatch = toRepoPath(absPatch, repoRoot);
    if (isExcluded(relPatch, excludePatterns)) {
      console.log(`  skip excluded patch: ${relPatch}`);
      continue;
    }
    if (!existsSync(absPatch)) throw new Error(`Patch not found: ${relPatch}`);
    git(repoRoot, ['apply', '--cached', absPatch], { dryRun });
    console.log(`  cachedPatches: ${relPatch}`);
  }

  if (staged.size > 0) git(repoRoot, ['add', '--', ...staged], { dryRun });
  return [...staged];
}

function hasStagedChanges(repoRoot, dryRun) {
  if (dryRun) return true;
  const result = git(repoRoot, ['diff', '--cached', '--quiet'], { allowFailure: true });
  return result.status !== 0;
}

function runBatch(batch, index, total, configDir, repoRoot, excludePatterns, dryRun) {
  const label = batch.id ?? `batch ${index}/${total}`;
  const subject = batch.message.split('\n')[0];
  console.log(`\n=== ${label} ===`);
  console.log(`Message: ${subject}${batch.message.includes('\n') ? '…' : ''}`);

  const stagedFiles = stageBatch(batch, configDir, repoRoot, excludePatterns, dryRun);
  if (stagedFiles.length === 0 && !batch.cachedPatches?.length) {
    console.log('  skip: no files to stage');
    return { committed: false, skipped: true };
  }

  if (!dryRun && !hasStagedChanges(repoRoot, false)) {
    if (batch.skipIfEmpty !== false) {
      console.log('  skip: nothing staged (no diff)');
      return { committed: false, skipped: true };
    }
    throw new Error(`Batch ${index} has no staged changes`);
  }

  gitCommit(repoRoot, batch.message, dryRun);
  console.log(`  committed${dryRun ? ' (dry-run)' : ''}: ${stagedFiles.join(', ') || 'patch only'}`);
  return { committed: true, skipped: false };
}

function selectBatches(batches, from, only) {
  const numbered = batches.map((batch, index) => ({ batch, number: index + 1 }));
  if (only?.length) {
    const allowed = new Set(only);
    return numbered.filter(({ number }) => allowed.has(number));
  }
  return numbered.filter(({ number }) => number >= from);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.config) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const repoRoot = detectRepoRoot();
  const { config, abs: configAbs } = loadConfig(args.config, repoRoot);
  const configDir = dirname(configAbs);
  const exclude = [...DEFAULT_EXCLUDE, ...(config.exclude ?? [])];

  warnExcludedDirty(repoRoot, exclude);

  const selected = selectBatches(config.batches, args.from, args.only);
  if (selected.length === 0) {
    throw new Error('No batches selected (check --from / --only)');
  }

  console.log(
    `Running ${selected.length} batch(es) from ${normalizePath(relative(repoRoot, configAbs))}${args.dryRun ? ' [DRY RUN]' : ''}`
  );

  let committed = 0;
  let skipped = 0;
  for (const { batch, number } of selected) {
    const result = runBatch(
      batch,
      number,
      config.batches.length,
      configDir,
      repoRoot,
      exclude,
      args.dryRun
    );
    if (result.committed) committed += 1;
    if (result.skipped) skipped += 1;
  }

  console.log(`\nDone: ${committed} commit(s), ${skipped} skipped.`);

  if (!args.dryRun) {
    const status = git(repoRoot, ['status', '--short'], { allowFailure: true });
    if (status.stdout?.trim()) {
      console.log('\nRemaining changes:');
      console.log(status.stdout.trimEnd());
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`\nError: ${error.message}`);
  process.exit(1);
}
