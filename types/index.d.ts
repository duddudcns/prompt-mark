export type PendingPrompts = { text: string; at: number }[]

declare module 'claude-code' {
  interface PluginState {
    'prompt-mark': { pending: PendingPrompts }
  }
}
