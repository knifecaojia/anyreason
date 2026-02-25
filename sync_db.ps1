param (
    [string]$ServerHost = "172.245.56.55",
    [string]$RemoteUser = "root",
    [string]$LocalContainer = "anyreason-postgres",
    [string]$RemoteContainer = "anyreason-prod-postgres",
    [string]$DbUser = "postgres",
    [string]$DbName = "anyreason"
)

Write-Host "Syncing database from local container '$LocalContainer' to remote host '$ServerHost' container '$RemoteContainer'..."

# Check if local container is running
if (!(docker ps -q -f name=$LocalContainer)) {
    Write-Error "Local container '$LocalContainer' is not running."
    exit 1
}

# Dump and restore
# Note: We use -T to disable pseudo-tty allocation for input, which is important for piping
$dumpCmd = "docker exec $LocalContainer pg_dump -U $DbUser -d $DbName --clean --if-exists"
$restoreCmd = "docker exec -i $RemoteContainer psql -U $DbUser -d $DbName"

# Execute via ssh
# We need to run the dump locally and pipe to ssh
# PowerShell piping to external command might be tricky with encoding, so we use cmd /c
cmd /c "$dumpCmd | ssh $RemoteUser@$ServerHost ""$restoreCmd"""

if ($LASTEXITCODE -eq 0) {
    Write-Host "Database sync completed successfully!"
} else {
    Write-Error "Database sync failed."
}
