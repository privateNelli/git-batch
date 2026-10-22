#!/usr/bin/env bash
# Install git-batch into a repository or the current user profile.
set -euo pipefail

SCOPE="project"
TARGET=""
NO_EXAMPLE=0

usage() {
  echo "Usage: ./install.sh [--scope project|user] [--target <repo>] [--no-example]"
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --scope)
      SCOPE="${2:-}"
      shift 2
      ;;
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --no-example)
      NO_EXAMPLE=1
      shift
      ;;
    -h|--help)
      usage
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="$ROOT/skill"

if [[ ! -f "$SOURCE/SKILL.md" ]]; then
  echo "Missing $SOURCE/SKILL.md" >&2
  exit 1
fi

copy_skill() {
  local dest="$1"
  rm -rf "$dest"
  mkdir -p "$dest"
  cp -R "$SOURCE"/. "$dest"/
  echo "skill  -> $dest"
}

copy_command() {
  local dest="$1/.cursor/commands/git-batch.md"
  mkdir -p "$(dirname "$dest")"
  if [[ -f "$dest" ]]; then
    echo "comando ya existe, no se pisa: $dest"
    return
  fi
  cp "$ROOT/commands/git-batch.md" "$dest"
  echo "comando -> $dest"
}

install_into() {
  local root="$1"
  local with_command="$2"
  local with_example="$3"
  copy_skill "$root/.cursor/skills/git-batch"
  copy_skill "$root/.claude/skills/git-batch"
  copy_skill "$root/.agents/skills/git-batch"
  if [[ "$with_command" == "1" ]]; then
    copy_command "$root"
  fi
  if [[ "$with_example" == "1" ]]; then
    local example="$root/scripts/commit-batches/example.json"
    if [[ ! -f "$example" ]]; then
      mkdir -p "$(dirname "$example")"
      cp "$SOURCE/templates/example.json" "$example"
      echo "ejemplo -> $example"
    else
      echo "ejemplo ya existe, no se pisa: $example"
    fi
  fi
}

if [[ "$SCOPE" == "user" ]]; then
  install_into "$HOME" 0 0
  echo
  echo "Instalada para el usuario. Ejecuta el script con el cwd dentro del repo que quieres commitear."
  exit 0
fi

if [[ "$SCOPE" != "project" ]]; then
  echo "Scope inválido: $SCOPE" >&2
  usage
fi

if [[ -z "$TARGET" ]]; then
  TARGET="$(pwd)"
fi

TARGET="$(cd "$TARGET" && pwd)"
if ! git -C "$TARGET" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "No hay un repositorio git en $TARGET" >&2
  exit 1
fi

TOP="$(git -C "$TARGET" rev-parse --show-toplevel)"
EXAMPLE=1
if [[ "$NO_EXAMPLE" == "1" ]]; then
  EXAMPLE=0
fi
install_into "$TOP" 1 "$EXAMPLE"
echo
echo "Listo. En Cursor: /git-batch"
echo "Dry-run:"
echo "  node \"$TOP/.cursor/skills/git-batch/scripts/git-batch-commit.mjs\" --config scripts/commit-batches/<tema>.json --dry-run"
