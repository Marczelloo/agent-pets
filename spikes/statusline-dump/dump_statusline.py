"""Spike S3: zapisuje JSON, który Claude Code przekazuje statusline, i wypisuje krótki tekst."""
import json, os, sys, time
raw = sys.stdin.buffer.read()
out = os.path.join(os.environ.get("TEMP", "."), "agent-pets-rec")
os.makedirs(out, exist_ok=True)
with open(os.path.join(out, f"statusline-{int(time.time() * 1000)}.json"), "wb") as f:
    f.write(raw)
print("agent-pets spike: statusline dump")
