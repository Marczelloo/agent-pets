// Agent Pets plugin contract. `pet` and `nudges` mirror the app's Settings → Apps switches, as the board
// carries them (the app is the truth, these redraw whatever reads them); `mood` is what the pixel pet is doing and when its last event was.
declare module 'claude-code' {
  interface PluginState {
    'agent-pets': {
      pet: boolean
      nudges: boolean
      mood: { state: 'idle' | 'thinking' | 'working' | 'waiting' | 'done' | 'error' | 'sleeping'; at: number }
    }
  }
}
