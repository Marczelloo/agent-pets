import type { Register } from 'claude-code'
import { registerNudges } from './nudge'
import { registerPane } from './pane'
import { registerPet } from './pet'
import { registerReport } from './report'

export const register: Register = on => {
  registerReport(on)
  registerPane(on)
  registerNudges(on)
  registerPet(on)
}
