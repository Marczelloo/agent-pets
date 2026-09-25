; Agent Pets: przed odinstalowaniem usuwa hooki i przelotkę statusline z ~/.claude/settings.json (z kopią),
; wpis autostartu, rejestrację powiadomień oraz hook.exe i endpoint.json z ~/.agent-pets.
; Zaznaczone „usuń dane aplikacji” usuwa też ~/.agent-pets (ustawienia).
!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode = 1
    ; aktualizacja: nowa wersja zaraz się zainstaluje, integracje zostają
  ${ElseIf} $DeleteAppDataCheckboxState = 1
    ExecWait '"$INSTDIR\agent-pets.exe" --uninstall-integrations --remove-data'
  ${Else}
    ExecWait '"$INSTDIR\agent-pets.exe" --uninstall-integrations'
  ${EndIf}
!macroend
