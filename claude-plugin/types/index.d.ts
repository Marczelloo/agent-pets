// Agent Pets plugin contract. `pet` and `nudges` mirror the `$.store` switches the /pets pane toggles
// (the store is the truth, these redraw whatever reads them); `mood` is what the pixel pet is doing and when its last event was.
declare module 'claude-code' {
  interface PluginState {
    'agent-pets': {
      pet: boolean
      nudges: boolean
      mood: { state: 'idle' | 'thinking' | 'working' | 'waiting' | 'done' | 'error' | 'sleeping'; at: number }
    }
  }
}
