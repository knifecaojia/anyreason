
$netstatOut = netstat -ano | Select-String "6379"

$pids = @{}

foreach ($line in $netstatOut) {
    $parts = $line.ToString().Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries)
    if ($parts.Count -ge 5) {
        $pidVal = $parts[$parts.Count - 1]
        if ($pids.ContainsKey($pidVal)) {
            $pids[$pidVal]++
        } else {
            $pids[$pidVal] = 1
        }
    }
}

$sortedPids = $pids.GetEnumerator() | Sort-Object Value -Descending

if ($sortedPids.Count -eq 0) {
    Write-Host "没有发现连接到 6379 的进程。"
} else {
    Write-Host "连接 Redis (6379) 的进程统计 (Top 10):"
    $count = 0
    foreach ($item in $sortedPids) {
        if ($count -ge 10) { break }
        $pidVal = $item.Key
        $num = $item.Value
        
        $procName = "Unknown"
        if ($pidVal -eq "0") {
            $procName = "System (TIME_WAIT/Closed)"
        } else {
            try {
                $proc = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
                if ($proc) {
                    $procName = $proc.ProcessName + " (ID: $pidVal)"
                } else {
                    $procName = "Process Not Found (ID: $pidVal)"
                }
            } catch {
                $procName = "Error Accessing Process (ID: $pidVal)"
            }
        }

        Write-Host "PID: $pidVal - Count: $num - Process: $procName"
        $count++
    }
}
