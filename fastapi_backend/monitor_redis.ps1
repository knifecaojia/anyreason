
$targetPort = "6379"
$interval = 0.5 # seconds
$maxIterations = 20 # run for 10 seconds

Write-Host "Monitoring connections to $targetPort for $maxIterations iterations..."

$pids = @{}

for ($i = 0; $i -lt $maxIterations; $i++) {
    $netstatOut = netstat -ano | Select-String $targetPort
    foreach ($line in $netstatOut) {
        $parts = $line.ToString().Trim() -split "\s+"
        if ($parts.Count -ge 5) {
            $state = $parts[-2]
            $pidVal = $parts[-1]
            
            # Only interested in ESTABLISHED connections that are NOT PID 0
            if ($state -eq "ESTABLISHED" -and $pidVal -ne "0") {
                if ($pids.ContainsKey($pidVal)) {
                    $pids[$pidVal] = $pids[$pidVal] + 1
                } else {
                    $pids[$pidVal] = 1
                }
            }
        }
    }
    Start-Sleep -Seconds $interval
}

$sorted = $pids.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 5

if (-not $sorted) {
    Write-Host "No active processes found creating connections."
} else {
    foreach ($item in $sorted) {
        $pidVal = $item.Key
        $count = $item.Value 
        
        try {
            $p = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
            if ($p) { $procName = $p.ProcessName } else { $procName = "Unknown" }
        } catch {
            $procName = "Error"
        }
        
        Write-Host "PID: $pidVal - Process: $procName - Detected $count times"
    }
}
