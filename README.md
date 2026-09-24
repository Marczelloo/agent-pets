# Agent Pets

Zwierzaki w pasku zadań Windows 11 pokazujące stan agentów kodujących (Claude Code, Codex, Agent Router).

- Specyfikacja: `docs/superpowers/specs/2026-09-24-agent-pets-design.md`
- Plan fazy 0–1: `docs/superpowers/plans/2026-09-24-agent-pets-phase0-1-core.md`
- Wyniki spike'ów: `docs/spikes/`
- Weryfikacja fazy 1: `docs/phase1-verification.md`
- Prototyp wizualny: `prototype/index.html` (test: `node prototype/smoke-test.js`)

## Rdzeń danych (faza 1)

    cargo build --release --workspace
    # hook.exe najlepiej skopiować w stałe miejsce, żeby przebudowy nie blokowały pliku
    copy target\release\hook.exe %LOCALAPPDATA%\agent-pets\hook.exe
    target\release\pets-cli.exe install-hooks %LOCALAPPDATA%\agent-pets\hook.exe
    target\release\pets-cli.exe run                 # tabela sesji na żywo
    target\release\pets-cli.exe run --record plik.jsonl
    target\release\pets-cli.exe replay plik.jsonl --speed 10
    target\release\pets-cli.exe uninstall-hooks

`install-hooks` robi kopię `~/.claude/settings.json` jako `settings.json.agent-pets.bak` i scala wpisy; `uninstall-hooks` usuwa tylko wpisy Agent Pets.

Testy: `cargo test --workspace`. Test anonimizatora próbek: `python tools/test_anonymize.py`.
