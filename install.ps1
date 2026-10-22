# Install git-batch into a repository or into the current user profile.
# Windows 10, PowerShell 5.1+.
param(
  [ValidateSet('Project', 'User')]
  [string]$Scope = 'Project',
  [string]$Target,
  [switch]$NoExample
)

$ErrorActionPreference = 'Stop'

$SourceSkill = Join-Path $PSScriptRoot 'skill'
$SourceCommand = Join-Path $PSScriptRoot 'commands\git-batch.md'

if (-not (Test-Path -LiteralPath (Join-Path $SourceSkill 'SKILL.md'))) {
  throw "No encuentro skill/SKILL.md junto a install.ps1 ($PSScriptRoot)."
}

function Copy-Skill([string]$Destination) {
  $parent = Split-Path -Parent $Destination
  if (-not (Test-Path -LiteralPath $parent)) {
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
  }
  if (Test-Path -LiteralPath $Destination) {
    Remove-Item -LiteralPath $Destination -Recurse -Force
  }
  New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  Copy-Item -Path (Join-Path $SourceSkill '*') -Destination $Destination -Recurse -Force
  Write-Host "skill  -> $Destination"
}

function Copy-Command([string]$CommandsDir) {
  $destination = Join-Path $CommandsDir 'git-batch.md'
  if (-not (Test-Path -LiteralPath $CommandsDir)) {
    New-Item -ItemType Directory -Path $CommandsDir -Force | Out-Null
  }
  if (Test-Path -LiteralPath $destination) {
    Write-Host "comando ya existe, no se pisa: $destination"
    return
  }
  Copy-Item -LiteralPath $SourceCommand -Destination $destination -Force
  Write-Host "comando -> $destination"
}

function Install-Into([string]$Root, [switch]$WithCommand, [switch]$WithExample) {
  Copy-Skill (Join-Path $Root '.cursor\skills\git-batch')
  Copy-Skill (Join-Path $Root '.claude\skills\git-batch')
  Copy-Skill (Join-Path $Root '.agents\skills\git-batch')
  if ($WithCommand) {
    Copy-Command (Join-Path $Root '.cursor\commands')
  }
  if ($WithExample) {
    $exampleDir = Join-Path $Root 'scripts\commit-batches'
    $example = Join-Path $exampleDir 'example.json'
    if (-not (Test-Path -LiteralPath $example)) {
      New-Item -ItemType Directory -Path $exampleDir -Force | Out-Null
      Copy-Item -LiteralPath (Join-Path $SourceSkill 'templates\example.json') -Destination $example -Force
      Write-Host "ejemplo -> $example"
    } else {
      Write-Host "ejemplo ya existe, no se pisa: $example"
    }
  }
}

if ($Scope -eq 'User') {
  if (-not $env:USERPROFILE) {
    throw 'USERPROFILE no está definido.'
  }
  Install-Into -Root $env:USERPROFILE -WithCommand:$false -WithExample:$false
  Write-Host ''
  Write-Host 'Instalada para el usuario. Ábrela desde cualquier repo y ejecuta el script con el cwd dentro de ese repo.'
  exit 0
}

if (-not $Target) {
  $Target = (Get-Location).Path
}
$Target = (Resolve-Path -LiteralPath $Target).Path

$git = & git -C $Target rev-parse --is-inside-work-tree 2>$null
if ($LASTEXITCODE -ne 0 -or $git.Trim() -ne 'true') {
  throw "No hay un repositorio git en $Target. Pasa -Target con la raíz del repo."
}

$top = (& git -C $Target rev-parse --show-toplevel).Trim()
Install-Into -Root $top -WithCommand -WithExample:(-not $NoExample)

Write-Host ''
Write-Host 'Listo. En Cursor: /git-batch'
Write-Host "Dry-run:"
Write-Host "  node `"$top\.cursor\skills\git-batch\scripts\git-batch-commit.mjs`" --config scripts/commit-batches/<tema>.json --dry-run"
