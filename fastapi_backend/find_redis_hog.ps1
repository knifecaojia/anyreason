
$netstatOut = netstat -ano | Select-String "6379"

$pids = @{}

foreach ($line in $netstatOut) {
    # netstat output format: Proto  Local Address          Foreign Address        State           PID
    # We want the last token which is PID
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
    Write-Host "连接 Redis (6379) 的进程统计 (Top 5):"
    $count = 0
    foreach ($item in $sortedPids) {
        if ($count -ge 5) { break }
        $pidVal = $item.Key
        $num = $item.Value
        Write-Host "PID: $pidVal - 连接数: $num"
        
        # Get process name
        try {
            $proc = Get-Process -Id $pidVal -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "  进程名: $($proc.ProcessName)"
                Write-Host "  路径: $($proc.Path)"
                # Get command line if possible (requires WMI usually, but let's try basic info first)
                $wmi = Get-CimInstance Win32_Process -Filter "ProcessId = $pidVal"
                if ($wmi) {
                    Write-Host "  命令行: $($wmi.CommandLine)"
                }
            } else {
                Write-Host "  进程已结束或无法访问。"
            }
        } catch {
            Write-Host "  无法获取进程信息: $_"
        }
        Write-Host "----------------------------------------"
        $count++
    }
}
