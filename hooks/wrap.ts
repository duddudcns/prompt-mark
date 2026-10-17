// Terminal cells: Hangul, CJK, fullwidth forms and emoji take two.
const WIDE: [number, number][] = [
  [0x1100, 0x115f], [0x2e80, 0xa4cf], [0xac00, 0xd7a3], [0xf900, 0xfaff],
  [0xfe30, 0xfe4f], [0xff00, 0xff60], [0xffe0, 0xffe6], [0x1f300, 0x1faff], [0x20000, 0x3fffd],
]

const charWidth = (ch: string): number => {
  const code = ch.codePointAt(0) ?? 0
  return WIDE.some(([lo, hi]) => code >= lo && code <= hi) ? 2 : 1
}

export const displayWidth = (text: string): number => [...text].reduce((sum, ch) => sum + charWidth(ch), 0)

// Breaks one line to `width` cells, preferring the last space; a run with no space is cut.
const wrapLine = (line: string, width: number): string[] => {
  const out: string[] = []
  let rest = [...line]
  while (displayWidth(rest.join('')) > width) {
    let used = 0
    let cut = 0
    while (cut < rest.length && used + charWidth(rest[cut] ?? '') <= width) {
      used += charWidth(rest[cut] ?? '')
      cut++
    }
    const space = rest.slice(0, cut + 1).lastIndexOf(' ')
    const at = space > 0 ? space : Math.max(1, cut)
    out.push(rest.slice(0, at).join('').trimEnd())
    rest = rest.slice(space > 0 ? at + 1 : at)
  }
  out.push(rest.join(''))
  return out
}

// The bar runs down every drawn row, so the text is wrapped here rather than by the terminal.
export const wrapToWidth = (text: string, width: number): string[] =>
  text.split(/\r?\n/).flatMap(line => wrapLine(line, Math.max(1, width)))

export const textOf = (content: readonly { type: string; text?: string }[]): string =>
  content.filter(block => block.type === 'text' && typeof block.text === 'string').map(block => block.text).join('\n')

// Adds a prompt typed while a main turn runs; it waits until a row delivers it.
export const addPending = (pending: string[], text: string): string[] =>
  pending.includes(text) ? pending : [...pending, text].slice(-20)

// A queue record (door 'queue') also marks a prompt as waiting; a real row delivers it
// ('delivery' into the running turn, or 'prompt' opening the next one).
export const settlePending = (pending: string[], door: string, text: string): string[] => {
  if (door === 'queue') return pending.includes(text) ? pending : [...pending, text].slice(-20)
  // A delivery into a running turn wraps the prompt in a reminder: match by containment.
  if (door === 'delivery' || door === 'prompt') return pending.filter(p => !text.includes(p))
  return pending
}

// The person's own words: typed at the prompt, or sent from the phone through Remote Control.
export const isPersonsPrompt = (origin: { kind: string } | undefined): boolean =>
  origin?.kind === 'composer' || origin?.kind === 'bridge'
