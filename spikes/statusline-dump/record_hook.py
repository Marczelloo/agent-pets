"""Spike S3/S5: zapisuje JSON hooka Claude Code do %TEMP%/agent-pets-rec. Zawsze kod 0, nic na stdout."""
import json, os, sys, time
try:
    raw = sys.stdin.buffer.read()
    d = json.loads(raw)
    out = os.path.join(os.environ.get("TEMP", "."), "agent-pets-rec")
    os.makedirs(out, exist_ok=True)
    name = d.get("hook_event_name", "unknown")
    tool = d.get("tool_name", "")
    fn = f"hook-{name}{'-' + tool if tool else ''}-{int(time.time() * 1000)}.json"
    with open(os.path.join(out, fn), "wb") as f:
        f.write(raw)
except Exception:
    pass
sys.exit(0)
