export type PendingPrompts = string[]

declare module 'claude-code' {
  interface PluginState {
    'prompt-mark': { pending: PendingPrompts }
  }
}
