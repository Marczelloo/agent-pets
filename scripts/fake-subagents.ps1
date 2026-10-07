# Shows a fake Claude session with subagents on the running Agent Pets, for checking minis and their "+N" by eye.
#   scripts/fake-subagents.ps1 -Count 6     start (minis appear after 5 s)
#   scripts/fake-subagents.ps1 -Stop        end the fake session and its subagents
# Talks only to the local endpoint from ~/.agent-pets/endpoint.json; the token is never printed.
param(
  [int]$Count = 6,
  [switch]$Stop
)
$ErrorActionPreference = 'Stop'

$ep = Get-Content (Join-Path $HOME '.agent-pets/endpoint.json') -Raw | ConvertFrom-Json
$uri = "http://127.0.0.1:$($ep.port)/v1/events/claude"
$headers = @{ Authorization = "Bearer $($ep.token)" }
$session = 'fake-subagents-test'
$cwd = (Get-Location).Path

function Send-Hook([hashtable]$payload) {
  $payload.session_id = $session
  $payload.cwd = $cwd
  $body = @{ ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); ppid = $null; payload = $payload } | ConvertTo-Json -Depth 5 -Compress
  Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body $body | Out-Null
}

$ids = 1..$Count | ForEach-Object { 'fake{0:d2}' -f $_ }
if ($Stop) {
  foreach ($a in $ids) { Send-Hook @{ hook_event_name = 'SubagentStop'; agent_id = $a; agent_type = 'general-purpose' } }
  Send-Hook @{ hook_event_name = 'SessionEnd'; reason = 'other' }
  Write-Output "Ended $session and $Count subagents."
  return
}

Send-Hook @{ hook_event_name = 'UserPromptSubmit'; prompt = 'fake subagents test' }
foreach ($a in $ids) {
  Send-Hook @{ hook_event_name = 'SubagentStart'; agent_id = $a; agent_type = 'general-purpose' }
  Send-Hook @{ hook_event_name = 'PreToolUse'; agent_id = $a; agent_type = 'general-purpose'; tool_name = 'Read'; tool_input = @{ file_path = "$cwd/README.md" } }
  Start-Sleep -Milliseconds 50
}
Write-Output "Started $session with $Count subagents; minis show after 5 s. End it with: scripts/fake-subagents.ps1 -Stop -Count $Count"
