import type { Register } from 'claude-code'
import { registerNudges } from './nudge'
import { registerPane } from './pane'
import { registerReport } from './report'

export const register: Register = on => {
  registerReport(on)
  registerPane(on)
  registerNudges(on)
}
