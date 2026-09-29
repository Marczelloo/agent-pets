"""Test the anonymizer: no profile path may survive. Run: python tools/test_anonymize.py"""
import json
import os
import subprocess
import sys
import tempfile

sample = {
    "type": "x",
    "changes": {r"C:\Users\jdoe\a.txt": {"kind": "add"}},
    "cwd": r"C:\Users\jdoe\p",
    "note": r"see C:\Users\jdoe\x and /c/Users/jdoe/y",
    "tool_name": "Write",
    "prompt": "secret prompt",
}
with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False, encoding="utf-8") as f:
    f.write(json.dumps(sample) + "\n")
here = os.path.dirname(os.path.abspath(__file__))
out = subprocess.run([sys.executable, os.path.join(here, "anonymize.py"), f.name],
                     capture_output=True, text=True, encoding="utf-8").stdout
os.unlink(f.name)
print(out)
assert "jdoe" not in out, "user name leaked"
assert "secret" not in out, "prompt content leaked"
assert '"tool_name": "Write"' in out
print("OK")
