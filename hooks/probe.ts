import type { EngineInterface } from 'claude-code'

// Development probe: records the session's user rows while `.debug` exists in the plugin folder.
let isOn: boolean | undefined
const seen: unknown[] = []

export async function probe($: EngineInterface, data: Record<string, unknown>): Promise<void> {
  if (isOn === undefined) isOn = await $.fs.read(`${$.plugin.root}/.debug`).then(() => true, () => false)
  if (!isOn) return
  seen.push(data)
  await $.fs.write(`${$.plugin.root}/.debug-dump.json`, JSON.stringify(seen.slice(-80), null, 1))
}
