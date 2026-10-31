import type { EngineInterface, Register } from 'claude-code'

import { resolvePath, toPicture, type Picture } from './images'

// Diagnostic for "image stays blank in a remote session until scrolled".
// One call draws 8 pictures: A original, B shrunk, C original + late re-place,
// D shrunk + late re-place, each twice. Every picture carries a unique tEXt
// chunk so the terminal cannot reuse one upload for another.

const PLUGIN = 'prompt-mark'
export const TEST_TOOL = `mcp__${PLUGIN}__image_test`
const SHRINK_WIDTH = 400 // 24-bit 400px: smaller than the source even for text screenshots (32-bit 800px was larger)
const REDRAW_MS = 1500
const CELL_COLUMNS = 22

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function b64decode(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let buf = 0
  let bits = 0
  let n = 0
  for (const ch of clean) {
    buf = ((buf << 6) | B64.indexOf(ch)) & 0xffffff
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out[n++] = (buf >> bits) & 0xff
    }
  }
  return out.subarray(0, n)
}

export function b64encode(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 3) {
    const v = (b[i]! << 16) | ((b[i + 1] ?? 0) << 8) | (b[i + 2] ?? 0)
    s += B64[(v >> 18) & 63]! + B64[(v >> 12) & 63]!
    s += i + 1 < b.length ? B64[(v >> 6) & 63]! : '='
    s += i + 2 < b.length ? B64[v & 63]! : '='
  }
  return s
}

let crcTable: number[] | null = null
export function crc32(b: Uint8Array): number {
  crcTable ??= Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  let c = 0xffffffff
  for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// Same pixels, different bytes: a tEXt chunk right after IHDR (byte 33).
export function tagPng(base64: string, label: string): string {
  const png = b64decode(base64)
  const data = new TextEncoder().encode(`pmtest\0${label}`)
  const chunk = new Uint8Array(12 + data.length)
  const view = new DataView(chunk.buffer)
  view.setUint32(0, data.length)
  chunk.set(new TextEncoder().encode('tEXt'), 4)
  chunk.set(data, 8)
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)))
  const out = new Uint8Array(png.length + chunk.length)
  out.set(png.subarray(0, 33))
  out.set(chunk, 33)
  out.set(png.subarray(33), 33 + chunk.length)
  return b64encode(out)
}

export type Variant = { label: string; picture: Picture; redraw: boolean }

export function variantsOf(original: Picture, shrunk: Picture): Variant[] {
  const plan: [string, Picture, boolean][] = [
    ['A', original, false],
    ['B', shrunk, false],
    ['C', original, true],
    ['D', shrunk, true],
  ]
  return [1, 2].flatMap(round =>
    plan.map(([kind, p, redraw]) => {
      const label = `${kind}${round}`
      return { label, redraw, picture: { ...p, png: tagPng(p.png, label), name: label } }
    }),
  )
}

const ps = (s: string) => `'${s.replace(/'/g, "''")}'`

// Windows PowerShell + System.Drawing: no install needed on the remote PCs.
async function shrink($: EngineInterface, path: string): Promise<Picture | null> {
  const script = [
    'Add-Type -AssemblyName System.Drawing',
    `$s=[Drawing.Image]::FromFile(${ps(path.replace(/\//g, '\\'))})`,
    `$w=[Math]::Min(${SHRINK_WIDTH},$s.Width); $h=[int]($s.Height*$w/$s.Width)`,
    '$b=New-Object Drawing.Bitmap $w,$h,([Drawing.Imaging.PixelFormat]::Format24bppRgb); $g=[Drawing.Graphics]::FromImage($b)',
    "$g.InterpolationMode='Bilinear'; $g.DrawImage($s,0,0,$w,$h)",
    '$m=New-Object IO.MemoryStream; $b.Save($m,[Drawing.Imaging.ImageFormat]::Png)',
    '[Convert]::ToBase64String($m.ToArray())',
  ].join('; ')
  const r = await $.process.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', script])
  return r.exitCode === 0 ? toPicture(r.stdout.trim(), 'shrunk') : null
}

const tests = new Map<string, Variant[]>()
const scheduled = new Set<string>()

// Called from images.tsx's one session.start hook (one per event without a matcher).
export async function registerTestTool($: EngineInterface): Promise<void> {
  await $.tool.register({
      name: 'image_test',
      description:
        'Diagnostic: draws one PNG as 8 labelled pictures (A original, B shrunk to 400px, C original + re-placed after 1.5s, D shrunk + re-placed) to find why pictures stay blank in a remote session. Run only when the user asks for the image test.',
      inputSchema: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Path to a PNG file' } },
        required: ['path'],
      },
      isDeferred: false,
    })
}

export const registerImageTest = (on: Parameters<Register>[0]): void => {
  on('tool.call', { tool: new RegExp(`^${TEST_TOOL}$`) }, async ($, e) => {
    const raw = (e as unknown as { path?: string }).path
    if (!raw) return { deny: 'path is required' }
    const cwd = (await $.session.cwd().catch(() => '')) ?? ''
    const home = (await $.env.get('USERPROFILE').catch(() => '')) || ''
    const path = resolvePath(raw, cwd, home)
    const got = await $.fs.read(path, { as: 'bytes' }).catch(() => null)
    const original = got ? toPicture(String((got as unknown as { base64?: string }).base64 ?? ''), 'original') : null
    if (!original) return { deny: `Not a PNG under 2 MiB: ${path}` }
    const shrunk = await shrink($, path).catch(() => null)
    if (!shrunk) return { deny: 'Shrinking failed (needs Windows PowerShell + System.Drawing)' }
    tests.set(e.tool_use_id, variantsOf(original, shrunk))
    const kb = (p: Picture) => Math.round((p.png.length * 3) / 4 / 1024)
    return {
      result: `Image test drawn: A/C original ${original.width}x${original.height} ${kb(original)}KB, B/D shrunk ${shrunk.width}x${shrunk.height} ${kb(shrunk)}KB. Ask the user which labels show without scrolling after 3s.`,
    }
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const props = e.props as { tool: string; tool_use_id: string }
    if (e.surface !== 'terminal' || props.tool !== TEST_TOOL) return next(e)
    const variants = tests.get(props.tool_use_id)
    if (!variants) return next(e)
    const { Box, Text, Image } = $.ui.resolve(e) as Extract<ReturnType<EngineInterface['ui']['resolve']>, { Image: unknown }>
    const rows = (p: Picture) => Math.max(1, Math.round((CELL_COLUMNS * p.height) / p.width / 2))
    if (!scheduled.has(e.requestId)) {
      scheduled.add(e.requestId)
      $.clock.after(REDRAW_MS, async () => {
        const results: string[] = []
        for (const v of variants.filter(x => x.redraw)) {
          const r = await $.ui.blit({ requestId: e.requestId, key: v.label, source: { png: v.picture.png } }).catch(err => ({ deny: String(err) }))
          results.push(`${v.label}:${'deny' in r && r.deny ? r.deny : 'ok'}`)
        }
        $.ui.toast(`image_test 재배치 ${results.join(' ')}`)
      })
    }
    const own = await next(e)
    return (
      <Box flexDirection="column">
        {own}
        {[0, 4].map(start => (
          <Box key={`r${start}`} flexDirection="row" paddingLeft={2}>
            {variants.slice(start, start + 4).map(v => (
              <Box key={v.label} flexDirection="column" marginRight={1}>
                <Text bold>{v.label}</Text>
                <Image key={v.label} source={{ png: v.picture.png }} columns={CELL_COLUMNS} rows={rows(v.picture)} alt={`[${v.label}]`} />
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    )
  })
}
