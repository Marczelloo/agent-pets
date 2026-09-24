# Średnie CPU (% całej maszyny) procesu i jego potomków (WebView2) przez N sekund.
# Użycie: tools\cpu.ps1 [-Name agent-pets] [-Seconds 30]
param([string]$Name = "agent-pets", [int]$Seconds = 30)
$root = Get-Process $Name -ErrorAction Stop | Select-Object -First 1
$all = Get-CimInstance Win32_Process
function Kids($ppid) { $all | Where-Object { $_.ParentProcessId -eq $ppid } | ForEach-Object { $_.ProcessId; Kids $_.ProcessId } }
$ids = @($root.Id) + @(Kids $root.Id)
$sum = { ($ids | ForEach-Object { (Get-Process -Id $_ -ErrorAction SilentlyContinue).TotalProcessorTime.TotalMilliseconds } | Measure-Object -Sum).Sum }
$t0 = & $sum
Start-Sleep -Seconds $Seconds
$t1 = & $sum
$cores = [Environment]::ProcessorCount
$pct = ($t1 - $t0) / ($Seconds * 1000) / $cores * 100
"procesy: $($ids.Count), rdzenie: $cores, CPU srednio: {0:N2}% maszyny ({1:N1}% jednego rdzenia)" -f $pct, ($pct * $cores)
