import type { Register } from 'claude-code'
import { registerPane } from './pane'
import { registerReport } from './report'

export const register: Register = on => {
  registerReport(on)
  registerPane(on)
}
