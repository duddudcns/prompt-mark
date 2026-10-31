import type { EngineInterface, Register, RenderChildren } from 'claude-code'

// Images: pictures drawn with Claude Code's own Image element, from PNG bytes the mod
// holds: no shell, no converter, so it behaves the same on Windows, macOS and
// Linux. Non-PNG input is skipped (the engine's Image takes PNG or RGBA only).
// Module memory starts over on a reload or resume, so pictures shown before
// that are drawn again only where the file can be read again (show_image).

const PLUGIN = 'prompt-mark'
const TOOL = `mcp__${PLUGIN}__show_image`
const MAX_BYTES = 2 * 1024 * 1024 // Image's own cap on held bytes
const MAX_COLUMNS = 80
const MAX_ROWS = 30
const TOOL_LIMIT = 32 // show_image pictures kept (re-read from disk after)
const PASTE_LIMIT = 64 // prompt rows whose pasted pictures are kept

export type Picture = { png: string; width: number; height: number; name: string }

// Insertion-ordered map trimmed from the oldest end.
function keep<V>(map: Map<string, V>, key: string, value: V, limit: number) {
  map.delete(key)
  map.set(key, value)
  while (map.size > limit) map.delete(map.keys().next().value!)
}
const shown = new Map<string, Picture>()
const pastes = new Map<string, Picture[]>()

// Engine calls in a form whose synchronous throw also lands in .catch.
const safe = <T,>(call: () => Promise<T>) => Promise.resolve().then(call)

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const headerBytes = (base64: string): number[] => {
  const out: number[] = []
  let buf = 0
  let bits = 0
  for (const ch of base64.slice(0, 44)) {
    const v = B64.indexOf(ch)
    if (v < 0) continue
    buf = (buf << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buf >> bits) & 0xff)
    }
  }
  return out
}

// Width and height from a PNG's IHDR, or null when it is not a PNG.
export function pngSize(base64: string): { width: number; height: number } | null {
  const b = headerBytes(base64)
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null
  const at = (i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0
  const width = at(16)
  const height = at(20)
  return width && height ? { width, height } : null
}

export const decodedBytes = (base64: string) =>
  Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0)

export function toPicture(base64: string, name: string): Picture | null {
  if (decodedBytes(base64) > MAX_BYTES) return null
  const size = pngSize(base64)
  return size ? { png: base64, name, ...size } : null
}

// Cells for a picture: a cell is about twice as tall as wide; never upscaled
// past ~10 px per column.
export function boxFor(p: { width: number; height: number }, viewportColumns = 100) {
  let columns = Math.max(4, Math.min(MAX_COLUMNS, viewportColumns - 6, Math.round(p.width / 10)))
  let rows = Math.max(1, Math.round((columns * p.height) / p.width / 2))
  if (rows > MAX_ROWS) {
    rows = MAX_ROWS
    columns = Math.max(1, Math.round((rows * 2 * p.width) / p.height))
  }
  return { columns: Math.min(columns, 255), rows: Math.min(rows, 255) }
}

// C:\a, C:/a or ~/a as a path the engine opens; relative paths join the cwd.
export function resolvePath(raw: string, cwd: string, home: string): string {
  let p = raw.trim().replace(/^(['"])(.*)\1$/, '$2').replace(/\\/g, '/')
  if (p === '~' || p.startsWith('~/')) p = home.replace(/\\/g, '/') + p.slice(1)
  if (/^[A-Za-z]:\//.test(p) || p.startsWith('/')) return p
  return `${cwd.replace(/\\/g, '/').replace(/\/$/, '')}/${p}`
}

// Image blocks in a stored message: the Messages API's shape and MCP's.
export function pngsIn(value: unknown, depth = 0): string[] {
  if (depth > 4 || typeof value !== 'object' || value === null) return []
  const v = value as Record<string, unknown>
  const src = v.source as Record<string, unknown> | undefined
  if (v.type === 'image' && src && typeof src.data === 'string') return [src.data]
  if (v.type === 'image' && typeof v.data === 'string') return [v.data]
  const kids = Array.isArray(value) ? value : [v.content]
  return kids.flatMap(k => pngsIn(k, depth + 1))
}

// A prompt row's blocks are drawn under ids whose last group is the block
// index (seen on 2.1.316), so the row is keyed by the first four groups and
// only block 0 draws its pictures.
export const rowKey = (id: string) => id.split('-').slice(0, 4).join('-')
const isFirstBlock = (requestId: string) => /-0+$/.test(requestId)

export const SHOWN = /Shown: (.+?) \(\d+x\d+\)/

const readPng = (out: unknown): Picture | null => {
  const o = out as { type?: string; file?: { base64?: string } } | undefined
  return o?.type === 'image' && o.file?.base64 ? toPicture(o.file.base64, 'read') : null
}

export const registerImages = (on: Parameters<Register>[0]): void => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'show_image',
      description:
        'Shows a PNG image file to the user inline in their terminal (kitty-protocol terminals such as Ghostty, kitty, Orca). Use it to show screenshots, charts or generated images instead of asking the user to open a file. Takes an absolute path (Windows paths are fine). PNG only, up to 2 MiB. The image goes to the user, not to you.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Path to a PNG file' } },
        required: ['path'],
      },
      isDeferred: false,
    })
    return next(e)
  })

  on('tool.call', { tool: new RegExp(`^${TOOL}$`) }, async ($, e) => {
    const raw = (e as unknown as { path?: string }).path
    if (!raw) return { deny: 'path is required' }
    const cwd = (await safe(() => $.session.cwd()).catch(() => '')) ?? ''
    const home =
      (await safe(() => $.env.get('USERPROFILE')).catch(() => '')) ||
      (await safe(() => $.env.get('HOME')).catch(() => '')) ||
      ''
    const path = resolvePath(raw, cwd, home)
    const got = await safe(() => $.fs.read(path, { as: 'bytes' })).catch(() => null)
    if (!got) return { deny: `No file at ${path}` }
    const picture = toPicture(String((got as unknown as { base64?: string }).base64 ?? ''), path.split('/').pop() ?? path)
    if (!picture) return { deny: `Not a PNG under 2 MiB: ${path}` }
    keep(shown, e.tool_use_id, picture, TOOL_LIMIT)
    return { result: `Shown: ${path} (${picture.width}x${picture.height})` }
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isErrored) return next(e)
    const props = e.props as { tool: string; tool_use_id: string; output: unknown }
    let picture: Picture | null | undefined
    if (props.tool === TOOL) {
      picture = shown.get(props.tool_use_id)
      if (!picture) {
        // Dropped from memory (reload, resume, trimmed): read the file again.
        const text = typeof props.output === 'string' ? props.output : JSON.stringify(props.output ?? '')
        const path = SHOWN.exec(text)?.[1]
        const got = path ? await safe(() => $.fs.read(path, { as: 'bytes' })).catch(() => null) : null
        picture = got ? toPicture(String((got as unknown as { base64?: string }).base64 ?? ''), path!) : null
        if (picture) keep(shown, props.tool_use_id, picture, TOOL_LIMIT)
      }
    } else if (props.tool === 'Read') {
      picture = readPng(props.output)
    }
    if (!picture) return next(e)
    return drawUnder($.ui.resolve(e), e.viewport?.columns, await next(e), [picture])
  })

  // Reads folded into a count line ("Read 2 files"): the line, then each picture.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)
    const found = e.props.calls
      .filter(c => c.tool === 'Read' && !c.isRunning && !c.isErrored)
      .map(c => readPng(c.output))
      .filter((p): p is Picture => p !== null)
    if (found.length === 0) return next(e)
    return drawUnder($.ui.resolve(e), e.viewport?.columns, await next(e), found)
  })
}

// Pasted images: kept by their prompt row as the row is stored. Called from
// the plugin's one session.append hook (register.tsx).
export function capturePastes(door: string, uuid: string, content: unknown): void {
  if (door !== 'prompt' && door !== 'delivery') return
  const found = pngsIn(content)
    .map((b, i) => toPicture(b, `pasted-${i + 1}`))
    .filter((p): p is Picture => p !== null)
  if (found.length > 0) keep(pastes, rowKey(uuid), found, PASTE_LIMIT)
}

// Pictures pasted into a prompt row, drawn by the prompt row's own hook
// (register.tsx) so no other hook can sit between the text and them.
export function pastedFor(requestId: string, surface: string): Picture[] {
  if (surface !== 'terminal' || !isFirstBlock(requestId)) return []
  return pastes.get(rowKey(requestId)) ?? []
}

type Ui = ReturnType<EngineInterface['ui']['resolve']>

// The row's own drawing, then each picture under it.
export function drawUnder(ui: Ui, columns: number | undefined, own: RenderChildren, pictures: Picture[]) {
  // Terminal rows only reach here, and the terminal table has Image.
  const { Box, Image } = ui as Extract<Ui, { Image: unknown }>
  return (
    <Box flexDirection="column">
      {own}
      {pictures.map((p, i) => (
        <Box key={`img-${i}`} paddingLeft={2}>
          <Image source={{ png: p.png }} {...boxFor(p, columns)} alt={`[image] ${p.name}`} />
        </Box>
      ))}
    </Box>
  )
}
