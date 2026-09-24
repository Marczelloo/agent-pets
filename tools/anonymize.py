"""Anonimizuje pliki JSON/JSONL: zachowuje strukturę, typy, nazwy narzędzi i liczby,
zastępuje treść wiadomości i ścieżki.

Użycie:
    python tools/anonymize.py plik.jsonl > wynik.jsonl     # każda linia osobno
    python tools/anonymize.py --json plik.json > wynik.json
"""
import json
import re
import sys

KEEP_KEYS = {
    "type", "name", "namespace", "status", "role", "originator", "source", "thread_source",
    "entrypoint", "model", "reason", "limit_id", "plan_type", "hook_event_name", "tool_name",
    "subtype", "level", "operation", "notification_type", "permission_mode", "message",
}
REDACT_KEYS = {
    "prompt", "last_assistant_message", "content", "text", "description", "subject", "activeForm",
    "aiTitle", "customTitle", "lastPrompt", "encrypted_content", "summary", "output", "stdout", "stderr",
}
PATH_RE = re.compile(r"^[A-Za-z]:[\\/]")
# "Users\<nazwa>", "Users\\<nazwa>" (w JSON) i "Users/<nazwa>"
USER_RE = re.compile(r"(?i)(Users(?:\\\\|\\|/))[^\\/\"]+")


def safe(line):
    """Ostatnia linia obrony: żadna ścieżka profilu użytkownika nie może zostać w wyniku."""
    return USER_RE.sub(r"\1user", line)


def scrub(v, key=None):
    if isinstance(v, dict):
        out = {}
        for i, (k, x) in enumerate(v.items()):
            nk = f"C:\\work\\file{i}" if PATH_RE.match(k) else k
            out[nk] = scrub(x, k)
        return out
    if isinstance(v, list):
        if key in REDACT_KEYS:
            return [scrub(x, None) if isinstance(x, dict) else "<redacted>" for x in v[:3]]
        return [scrub(x, key) for x in v]
    if isinstance(v, str):
        if key in KEEP_KEYS:
            return v
        if key in ("input", "arguments", "command"):
            calls = re.findall(r"tools\.\w+\s*\(", v)
            if calls:
                return " ".join(calls)
            if key == "arguments" and v.strip().startswith("{"):
                try:
                    return json.dumps(scrub(json.loads(v)), ensure_ascii=False)
                except json.JSONDecodeError:
                    pass
            return "<redacted>"
        if key in REDACT_KEYS:
            return "<redacted>" if v else v
        if PATH_RE.match(v):
            return "C:\\work\\project"
        return "<redacted>" if len(v) > 40 else v
    return v


def main():
    args = sys.argv[1:]
    whole = args and args[0] == "--json"
    if whole:
        args = args[1:]
    sys.stdout.reconfigure(encoding="utf-8")
    text = open(args[0], encoding="utf-8").read()
    if whole:
        print(safe(json.dumps(scrub(json.loads(text)), ensure_ascii=False, indent=2)))
        return
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            print(safe(json.dumps(scrub(json.loads(line)), ensure_ascii=False)))
        except json.JSONDecodeError:
            pass


if __name__ == "__main__":
    main()
