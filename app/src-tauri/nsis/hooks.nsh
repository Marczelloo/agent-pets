; Agent Pets: before uninstalling, removes hooks and the statusline proxy from ~/.claude/settings.json (with a backup),
; the startup entry, notification registration, and hook.exe and endpoint.json from ~/.agent-pets.
; Selecting "remove app data" also removes ~/.agent-pets (settings).
!macro NSIS_HOOK_PREUNINSTALL
  ${If} $UpdateMode = 1
    ; update: a new version is about to install, so integrations remain
  ${ElseIf} $DeleteAppDataCheckboxState = 1
    ExecWait '"$INSTDIR\agent-pets.exe" --uninstall-integrations --remove-data'
  ${Else}
    ExecWait '"$INSTDIR\agent-pets.exe" --uninstall-integrations'
  ${EndIf}
!macroend
