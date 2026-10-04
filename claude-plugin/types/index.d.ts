// Agent Pets plugin contract. `pet` and `nudges` mirror the `$.store` switches the /pets pane toggles
// (the store is the truth, these redraw whatever reads them); later tasks add their own values here.
declare module 'claude-code' {
  interface PluginState {
    'agent-pets': { pet: boolean; nudges: boolean }
  }
}
