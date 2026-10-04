// Agent Pets plugin contract. Later tasks declare their `$.state` values under 'agent-pets'.
export type AgentPetsState = Record<string, never>

declare module 'claude-code' {
  interface PluginState {
    'agent-pets': AgentPetsState
  }
}
