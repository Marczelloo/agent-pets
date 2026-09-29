# Door for other agents

Agents without their own integration can still get a pet: send their state to Agent Pets with `hook.exe report` or one HTTP call. Turn the door on in **Settings → Apps → Door for other agents**.

## With hook.exe

```powershell
& "$HOME\.agent-pets\hook.exe" report --agent kilo --name "Kilo CLI" --session abc --state working --tool edit --title "Refactor"
& "$HOME\.agent-pets\hook.exe" report --agent kilo --session abc --state needs_you --question "Deploy now?"
& "$HOME\.agent-pets\hook.exe" report --agent kilo --session abc --state ended
```

## Over HTTP

The port and a random token are in `~/.agent-pets/endpoint.json`. The server listens only on `127.0.0.1`.

```powershell
$ep = Get-Content "$HOME\.agent-pets\endpoint.json" | ConvertFrom-Json
$body = @{ agent = "kilo"; name = "Kilo CLI"; session = "abc"; state = "done" } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$($ep.port)/v1/events/generic" `
  -Headers @{ Authorization = "Bearer $($ep.token)" } -ContentType "application/json" -Body $body
```

```bash
EP="$HOME/.agent-pets/endpoint.json"
PORT=$(grep -o '"port": *[0-9]*' "$EP" | grep -o '[0-9]*$')
TOKEN=$(grep -o '"token": *"[^"]*"' "$EP" | cut -d'"' -f4)
curl -s -X POST "http://127.0.0.1:$PORT/v1/events/generic" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"agent":"kilo","session":"abc","state":"working","tool":"bash","title":"npm test"}'
```

## Fields

| Field | Required | Value |
|---|---|---|
| `agent` | yes | your agent's id, `[a-z0-9-]{1,32}`. Ids of agents with their own integration (`claude`, `codex`, `opencode`, …) are refused |
| `session` | yes | session id, `[A-Za-z0-9_.:-]{1,128}` |
| `state` | yes | `thinking`, `working`, `needs_you`, `done`, `error`, `idle`, `sleep`, `compacting`, `ended`. `idle` and `sleep` only keep the session alive and update its fields; send `done` to end a turn (the pet goes idle 2 minutes later) |
| `name` | no | name to show (40 characters) |
| `tool` | no | with `working`: `edit`, `bash`, `read`, `grep`, `web`, `agent`, `mcp`, `other` |
| `title`, `question`, `cwd`, `model` | no | session title, the question while `needs_you`, working folder, model id |
| `app` | no | program: `terminal`, `vscode`, `t3code`, `cursor`, `antigravity`, `zed`, `jetbrains`, `other` |
| `pid` | no | the agent's process; when it exits, the pet says goodbye, and **Open** focuses its window |

## Responses

| Code | Meaning |
|---|---|
| `204` | event taken |
| `400` | a bad field |
| `401` | wrong token |
| `404` | the door is off |

`hook.exe report` prints the reason and exits with code 2 on any error. Text is cut to size and shown as plain text. A session without events falls asleep and ends like any other.
