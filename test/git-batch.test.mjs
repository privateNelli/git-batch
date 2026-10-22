import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'skill',
  'scripts',
  'git-batch-commit.mjs'
);

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(
    result.status,
    0,
    `git ${args.join(' ')} failed: ${result.stderr || result.stdout}`
  );
  return result.stdout;
}

function runBatch(cwd, args) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'git-batch-'));
  git(dir, ['init', '-b', 'main']);
  git(dir, ['config', 'user.name', 'git-batch test']);
  git(dir, ['config', 'user.email', 'git-batch@example.com']);
  git(dir, ['config', 'commit.gpgsign', 'false']);
  git(dir, ['config', 'core.autocrlf', 'false']);
  return dir;
}

function writeConfig(dir, name, config) {
  const folder = join(dir, 'scripts', 'commit-batches');
  mkdirSync(folder, { recursive: true });
  const file = join(folder, name);
  writeFileSync(file, JSON.stringify(config, null, 2));
  return file;
}

test('--help exits 0', () => {
  const result = runBatch(process.cwd(), ['--help']);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /git-batch-commit/);
});

test('missing config exits 1', () => {
  const result = runBatch(process.cwd(), []);
  assert.equal(result.status, 1);
});

test('fails outside a git repository', () => {
  const dir = mkdtempSync(join(tmpdir(), 'git-batch-nogit-'));
  try {
    writeFileSync(join(dir, 'batches.json'), '{"batches":[{"message":"x","files":["a"]}]}');
    const result = runBatch(dir, ['--config', 'batches.json']);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Not inside a git repository/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('commits only the files of each batch and keeps the rest dirty', () => {
  const dir = makeRepo();
  try {
    writeFileSync(join(dir, 'a.txt'), 'a\n');
    writeFileSync(join(dir, 'b.txt'), 'b\n');
    writeFileSync(join(dir, 'later.txt'), 'later\n');
    writeConfig(dir, 'topic.json', {
      batches: [
        { id: '1-a', message: 'feat(a): add a\n\nFirst slice.', files: ['a.txt'] },
        { id: '2-b', message: 'feat(b): add b', files: ['b.txt'] },
      ],
    });

    const dry = runBatch(dir, ['--config', 'scripts/commit-batches/topic.json', '--dry-run']);
    assert.equal(dry.status, 0, dry.stderr);
    assert.match(dry.stdout, /DRY RUN/);
    assert.equal(git(dir, ['status', '--short']).trim().length > 0, true);

    const real = runBatch(dir, ['--config', 'scripts/commit-batches/topic.json']);
    assert.equal(real.status, 0, real.stderr);
    assert.match(git(dir, ['log', '--format=%s']), /feat\(b\): add b\nfeat\(a\): add a/);
    assert.match(git(dir, ['log', '-1', '--format=%b', 'HEAD~1']), /First slice\./);
    assert.match(git(dir, ['show', '--name-only', '--format=', 'HEAD~1']), /a\.txt/);
    assert.doesNotMatch(git(dir, ['show', '--name-only', '--format=', 'HEAD~1']), /b\.txt/);
    assert.match(git(dir, ['status', '--short']), /later\.txt/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('--only runs the requested batch from a nested working directory', () => {
  const dir = makeRepo();
  try {
    writeFileSync(join(dir, 'a.txt'), 'a\n');
    writeFileSync(join(dir, 'b.txt'), 'b\n');
    writeConfig(dir, 'topic.json', {
      batches: [
        { id: '1-a', message: 'chore: a', files: ['a.txt'] },
        { id: '2-b', message: 'chore: b', files: ['b.txt'] },
      ],
    });
    const nested = join(dir, 'nested');
    mkdirSync(nested);
    const result = runBatch(nested, [
      '--config',
      '../scripts/commit-batches/topic.json',
      '--only',
      '2',
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(git(dir, ['log', '--format=%s']).trim(), 'chore: b');
    assert.match(git(dir, ['status', '--short']), /a\.txt/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('stages a deletion addressed relative to the config file', () => {
  const dir = makeRepo();
  try {
    writeFileSync(join(dir, 'gone.txt'), 'gone\n');
    git(dir, ['add', 'gone.txt']);
    git(dir, ['commit', '-m', 'chore: track gone']);
    rmSync(join(dir, 'gone.txt'));
    writeConfig(dir, 'delete.json', {
      batches: [
        {
          id: '1-delete',
          message: 'chore: remove gone',
          files: ['../../gone.txt'],
        },
      ],
    });
    const result = runBatch(dir, ['--config', 'scripts/commit-batches/delete.json']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /stage deletion: gone\.txt/);
    assert.equal(git(dir, ['ls-files', 'gone.txt']), '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('skips excluded files and preserves CRLF on insertLines', () => {
  const dir = makeRepo();
  try {
    writeFileSync(join(dir, 'keep.txt'), 'keep\n');
    git(dir, ['add', 'keep.txt']);
    git(dir, ['commit', '-m', 'chore: base']);

    mkdirSync(join(dir, 'logs'));
    writeFileSync(join(dir, 'logs', 'app-debug.log'), 'noise\n');
    writeFileSync(
      join(dir, 'CHANGELOG.md'),
      '| Date | Summary |\r\n|------|----------|\r\n| old | keep |\r\n'
    );
    writeConfig(dir, 'index.json', {
      exclude: ['**/*-debug.log'],
      batches: [
        {
          id: '1-log',
          message: 'chore: should not commit the log',
          files: ['logs/app-debug.log'],
        },
        {
          id: '2-index',
          message: 'docs: index the change',
          files: ['keep.txt'],
          insertLines: [
            {
              file: 'CHANGELOG.md',
              insertAfter: '|------|----------|',
              lines: ['| 2026-10-22 | docs: index |'],
              skipIfIncludes: 'docs: index',
            },
          ],
        },
      ],
    });

    const first = runBatch(dir, ['--config', 'scripts/commit-batches/index.json']);
    assert.equal(first.status, 0, first.stderr);
    assert.match(first.stdout, /skip excluded: logs\/app-debug\.log/);
    const changelog = readFileSync(join(dir, 'CHANGELOG.md'), 'utf8');
    assert.match(changelog, /\|------\|----------\|\r\n\| 2026-10-22 \| docs: index \|/);
    assert.equal(changelog.replaceAll('\r\n', '').includes('\n'), false);

    const second = runBatch(dir, ['--config', 'scripts/commit-batches/index.json', '--only', '2']);
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /already includes "docs: index"/);
    assert.equal(git(dir, ['log', '--format=%s']).split('\n').filter(Boolean).length, 2);
    assert.match(git(dir, ['status', '--short']), /logs\//);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cachedPatches commits the index hunk only', () => {
  const dir = makeRepo();
  try {
    writeFileSync(join(dir, 'partial.txt'), 'line1\n');
    git(dir, ['add', 'partial.txt']);
    git(dir, ['commit', '-m', 'chore: partial base']);
    mkdirSync(join(dir, 'patches'));
    writeFileSync(
      join(dir, 'patches', 'add-line.patch'),
      [
        'diff --git a/partial.txt b/partial.txt',
        '--- a/partial.txt',
        '+++ b/partial.txt',
        '@@ -1 +1,2 @@',
        ' line1',
        '+line2',
        '',
      ].join('\n')
    );
    writeConfig(dir, 'patch.json', {
      batches: [
        {
          id: '1-hunk',
          message: 'feat: stage one hunk',
          cachedPatches: ['patches/add-line.patch'],
        },
      ],
    });
    const result = runBatch(dir, ['--config', 'scripts/commit-batches/patch.json']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(git(dir, ['show', 'HEAD:partial.txt']), /line2/);
    assert.equal(readFileSync(join(dir, 'partial.txt'), 'utf8'), 'line1\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
