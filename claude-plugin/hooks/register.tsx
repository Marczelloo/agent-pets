import type { Register } from 'claude-code'
import { registerReport } from './report'

export const register: Register = on => {
  registerReport(on)
}
