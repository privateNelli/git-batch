---
name: git-batch
description: Plan focused commits from the dirty working tree and dry-run them
---

Sigue la skill `git-batch`.

Analiza `git status` y `git diff`. Agrupa los cambios sin commitear en batches de un commit cada uno, escribe `scripts/commit-batches/<tema>.json` y ejecuta el motor con `--dry-run`. Muéstrame la tabla de batches y el comando exacto para la corrida real.

No crees commits, no hagas push y no reescribas historia hasta que yo lo pida de forma explícita.
