
$netstatOut = netstat -ano | Select-String "6379"

$pids = @{}

foreach ($line in $netstatOut) {
    $parts = $line.ToString().Trim() -split "\s+"
    if ($parts.Count -ge 5) {
        $pidVal = $parts[-1]
        if ($pids.ContainsKey($pidVal)) {
            $pids[$pidVal] = $pids[$pidVal] + 1
        } else {
            $pids[$pidVal] = 1
        }
    }
}

$sorted = $pids.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 10

if (-not $sorted) {
    Write-Host "No connections found."
} else {
    foreach ($item in $sorted) {
        $pidVal = $item.Key
        $count = $item.Value
        $procName = "Unknown"
        
        if ($pidVal -eq "0") {
            $procName = "System (TIME_WAIT)"
        } else {
            try {
                $p = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
                if ($p) { $procName = $p.ProcessName }
            } catch {
                $procName = "Error"
            }
        }
        
        Write-Host "PID: $pidVal - Count: $count - Process: $procName"
    }
}
