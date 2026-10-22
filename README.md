# git-batch

Split a dirty working tree into focused commits. One JSON batch becomes one `git commit`. The agent plans the batches. The script stages exactly the listed paths and commits them. Nothing is pushed and existing history is left alone.

English quick start: from the target repo, on Windows,

```powershell
powershell -ExecutionPolicy Bypass -File C:\path\to\git-batch\install.ps1 -Target .
```

Then ask the agent for `/git-batch`. It writes `scripts/commit-batches/<topic>.json`, runs `--dry-run`, and commits only after you say so.

```powershell
node .cursor\skills\git-batch\scripts\git-batch-commit.mjs --config scripts\commit-batches\<topic>.json --dry-run
```

## Qué hace

El working tree se queda como está hasta que tú confirmas. El flujo es:

1. El agente lee `git status`, `git diff` y el estilo de `git log`.
2. Escribe un JSON con un batch por commit.
3. El motor hace `--dry-run` y enseña la tabla.
4. Si lo pides, cada batch ejecuta `git add` de sus paths y un `git commit`.

No reordena commits ya creados, no hace `git add -p` interactivo y no hace push.

El detalle del motor está en [HOW-IT-WORKS.md](HOW-IT-WORKS.md).

## Instalar en un repositorio

Hace falta Git y Node.js 18 o superior. PowerShell es el camino en Windows 10.

Desde la raíz del repo destino:

```powershell
powershell -ExecutionPolicy Bypass -File C:\ruta\git-batch\install.ps1 -Target .
```

Eso copia la skill en:

| Herramienta | Ruta |
| --- | --- |
| Cursor | `.cursor/skills/git-batch/` |
| Cursor, comando `/git-batch` | `.cursor/commands/git-batch.md` |
| Claude Code | `.claude/skills/git-batch/` |
| Agents | `.agents/skills/git-batch/` |

También deja `scripts/commit-batches/example.json` si todavía no existe. No toca `package.json`.

Para dejar el comando corto en el repo:

```json
{
  "scripts": {
    "git:batch": "node .cursor/skills/git-batch/scripts/git-batch-commit.mjs"
  }
}
```

```powershell
pnpm git:batch -- --config scripts/commit-batches/<tema>.json --dry-run
npm run git:batch -- --config scripts/commit-batches/<tema>.json --dry-run
```

Sin package manager:

```powershell
node .cursor\skills\git-batch\scripts\git-batch-commit.mjs --config scripts\commit-batches\<tema>.json --dry-run
```

Actualizar la skill es volver a correr el instalador. El comando de Cursor no se pisa si ya existe.

### Instalación de usuario

Una sola copia sirve para todos los repos de esa máquina. El script igual opera sobre el git root del directorio donde lo ejecutas.

```powershell
powershell -ExecutionPolicy Bypass -File C:\ruta\git-batch\install.ps1 -Scope User
```

Queda en `%USERPROFILE%\.cursor\skills\git-batch`, y las copias equivalentes para Claude Code y `.agents`.

### Linux y macOS

```bash
./install.sh --target /ruta/al/repo
./install.sh --scope user
```

### Copia manual

Copia el directorio `skill/` a `.cursor/skills/git-batch/` (y a `.claude/skills/git-batch/` o `.agents/skills/git-batch/` si usas esas herramientas). Copia `commands/git-batch.md` a `.cursor/commands/git-batch.md`.

Commitea esas carpetas si el equipo debe compartir la skill. No commitees los JSON de `scripts/commit-batches/` que describan trabajo a medio hacer, salvo que quieras conservarlos como historial del plan.

## Uso

En el chat:

```text
/git-batch
```

Si el slash command no está cargado:

```text
Usa la skill git-batch. Revisa mis cambios locales, agrupa por dominio,
escribe scripts/commit-batches/<tema>.json, corre dry-run y muéstrame la tabla.
No hagas commits reales hasta que yo lo confirme.
```

Pedidos útiles:

| Objetivo | Qué decir |
| --- | --- |
| Plan nuevo | Planifica git-batch para los cambios de esta rama |
| Un dominio | Batch solo para los archivos de auth. Ignora el resto |
| Revisar el JSON | Revisa scripts/commit-batches/mi-tema.json antes del dry-run |
| Ejecutar | Ejecuta git-batch con ese config, sin dry-run |
| Un batch | Corre solo el batch 2 con --only 2 |

Antes de la corrida real: el dry-run terminó sin errores, los mensajes se parecen a `git log`, y no hay secretos en `files`.

## JSON mínimo

```json
{
  "exclude": ["**/*-debug.log", ".env", ".env.local"],
  "batches": [
    {
      "id": "1-fix-upload",
      "message": "fix(upload): resumen imperativo\n\nPor qué este cambio va solo.",
      "files": ["src/upload.ts", "src/upload.test.ts"]
    }
  ]
}
```

Las rutas de `files` salen de la raíz del repo. También valen rutas relativas al JSON (`../../src/upload.ts`), que es el formato de los configs viejos de Katram.

Campos, `insertLines` y `cachedPatches`: [skill/templates/schema.md](skill/templates/schema.md). Plantilla: [skill/templates/example.json](skill/templates/example.json).

## Seguridad

El agente no debe listar `.env`, llaves, tokens ni logs de debug. El motor, además, siempre ignora estos nombres:

- `firebase-debug.log`
- `firestore-debug.log`
- `ui-debug.log`
- `pubsub-debug.log`
- `database-debug.log`

`exclude` también se salta, aunque el path esté en `files`. Un path que resuelve fuera del repositorio aborta el run.

La corrida real crea commits locales. Revísalos con `git log` y `git status` antes de hacer push.

## Desarrollo

```powershell
npm test
```

Los tests crean repos temporales y no tocan tu configuración global de Git.

## Licencia

[MIT](LICENSE)
