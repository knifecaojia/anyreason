param(
  [string]$EnvFile = ""
)

$repoRoot = Split-Path $PSScriptRoot -Parent
$composeBase = Join-Path $repoRoot "docker/docker-compose.yml"
$composeApp = Join-Path $repoRoot "docker/compose.app.yml"

if ([string]::IsNullOrWhiteSpace($EnvFile)) {
  $EnvFile = Join-Path $PSScriptRoot ".env"
}

$env:ANYREASON_ENV_FILE = $EnvFile

docker compose -f $composeBase up -d postgres | Out-Host
docker compose -f $composeBase -f $composeApp --profile app build backend | Out-Host
docker compose -f $composeBase -f $composeApp --profile app run --rm db-init | Out-Host

