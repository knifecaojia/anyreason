$ErrorActionPreference = "Continue"

Write-Host "== docker context =="
docker context ls
docker context show

Write-Host "`n== docker version =="
docker version

Write-Host "`n== DNS =="
Resolve-DnsName auth.docker.io -ErrorAction Continue | Format-Table -AutoSize
Resolve-DnsName registry-1.docker.io -ErrorAction Continue | Format-Table -AutoSize

Write-Host "`n== TCP 443 reachability =="
Test-NetConnection auth.docker.io -Port 443 | Format-List
Test-NetConnection registry-1.docker.io -Port 443 | Format-List

Write-Host "`n== curl checks (15s timeout) =="
curl.exe -I --max-time 15 "https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/python:pull"
curl.exe -I --max-time 15 https://registry-1.docker.io/v2/

Write-Host "`n== proxy env =="
Get-ChildItem Env: | Where-Object { $_.Name -match "^(HTTP|HTTPS|NO)_PROXY$" } | Format-Table -AutoSize

Write-Host "`n== winhttp proxy =="
netsh winhttp show proxy
