"""Test anonimizatora: żadna ścieżka profilu nie może przetrwać. Uruchom: python tools/test_anonymize.py"""
import json
import os
import subprocess
import sys
import tempfile

sample = {
    "type": "x",
    "changes": {r"C:\Users\jkowalski\a.txt": {"kind": "add"}},
    "cwd": r"C:\Users\jkowalski\p",
    "note": r"see C:\Users\jkowalski\x and /c/Users/jkowalski/y",
    "tool_name": "Write",
    "prompt": "tajny prompt",
}
with tempfile.NamedTemporaryFile("w", suffix=".jsonl", delete=False, encoding="utf-8") as f:
    f.write(json.dumps(sample) + "\n")
here = os.path.dirname(os.path.abspath(__file__))
out = subprocess.run([sys.executable, os.path.join(here, "anonymize.py"), f.name],
                     capture_output=True, text=True, encoding="utf-8").stdout
os.unlink(f.name)
print(out)
assert "jkowalski" not in out, "wyciek nazwy użytkownika"
assert "tajny" not in out, "wyciek treści promptu"
assert '"tool_name": "Write"' in out
print("OK")
