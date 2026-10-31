import { expect, mock, test } from 'claude-code/testing'

import { pngSize } from './images'
import { b64decode, b64encode, crc32, tagPng, variantsOf } from './imgtest'

// 1x1 PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

test('base64 왕복이 원본과 같다', async () => {
  expect(b64encode(b64decode(PNG))).toBe(PNG)
  expect(b64encode(new Uint8Array([1, 2]))).toBe('AQI=')
})

test('crc32 표준값', async () => {
  expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
})

test('tagPng: 크기는 그대로, 바이트는 라벨마다 다르다', async () => {
  const a = tagPng(PNG, 'A1')
  const b = tagPng(PNG, 'A2')
  expect(a).not.toBe(b)
  expect(pngSize(a)).toEqual({ width: 1, height: 1 })
  // 들어간 청크의 CRC: 길이 9, 'tEXt', 'pmtest\0A1'
  const bytes = b64decode(a)
  const chunk = bytes.subarray(33 + 4, 33 + 8 + 9)
  const crc = new DataView(bytes.buffer, bytes.byteOffset).getUint32(33 + 8 + 9)
  expect(crc).toBe(crc32(chunk))
})

test('variantsOf: 8장, 라벨 순서, C·D만 재배치, 전부 다른 바이트', async () => {
  const p = { png: PNG, width: 1, height: 1, name: 'x' }
  const v = variantsOf(p, p)
  expect(v.map(x => x.label)).toEqual(['A1', 'B1', 'C1', 'D1', 'A2', 'B2', 'C2', 'D2'])
  expect(v.filter(x => x.redraw).map(x => x.label)).toEqual(['C1', 'D1', 'C2', 'D2'])
  expect(new Set(v.map(x => x.picture.png)).size).toBe(8)
})

test('image_test: 8장 그리고, 1.5초 뒤 C·D만 다시 배치', async ($, on) => {
  const clock = mock.clock(on)
  on('fs.read', async () => ({ value: { base64: PNG } }) as never)
  on('process.run', async () => ({ value: { exitCode: 0, stdout: PNG + '\r\n', stderr: '' } }) as never)
  const blits: string[] = []
  on('ui.blit', async (_$, e) => {
    blits.push((e as { key: string }).key)
    return { value: {} } as never
  })
  on('ui.render', async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>result</Text>
  })
  const r = await $.tool.call({ tool: 'mcp__prompt-mark__image_test', path: 'C:/x.png', tool_use_id: 'tu1' } as never)
  expect(JSON.stringify(r)).toContain('Image test drawn')
  const ui = await $.ui.mount({ plugin: 'prompt-mark', surface: 'terminal', component: 'ToolResult', props: { tool: 'mcp__prompt-mark__image_test', tool_use_id: 'tu1', output: '' } as never, viewport: { columns: 120, rows: 40 } as never })
  expect(await ui.findAll({ type: 'Image' })).toHaveLength(8)
  await clock.advance(1600)
  expect(blits).toEqual(['C1', 'D1', 'C2', 'D2'])
})
