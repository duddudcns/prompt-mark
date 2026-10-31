import { expect, test } from 'claude-code/testing'

import { boxFor, decodedBytes, pngSize, pngsIn, resolvePath, rowKey, SHOWN, toPicture } from './images'

// 1x1 PNG
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='

test('PNG 헤더에서 크기를 읽고, PNG가 아니면 null', async () => {
  expect(pngSize(PNG)).toEqual({ width: 1, height: 1 })
  expect(pngSize('/9j/4AAQSkZJRgABAQAAAQABAAD')).toBe(null)
})

test('2 MiB 넘는 데이터는 그리지 않는다', async () => {
  expect(toPicture(PNG, 'a')?.width).toBe(1)
  expect(toPicture(PNG + 'A'.repeat(3 * 1024 * 1024), 'a')).toBe(null)
})

test('base64 패딩을 빼고 실제 바이트 수를 센다', async () => {
  expect(decodedBytes('AAAA')).toBe(3)
  expect(decodedBytes('AAA=')).toBe(2)
  expect(decodedBytes('AA==')).toBe(1)
})

test('칸 수: 셀은 세로 2배, 열 80·행 30 상한, 화면 폭 안', async () => {
  expect(boxFor({ width: 600, height: 300 }, 200)).toEqual({ columns: 60, rows: 15 })
  expect(boxFor({ width: 2000, height: 1000 }, 200)).toEqual({ columns: 80, rows: 20 })
  expect(boxFor({ width: 400, height: 1000 }, 200)).toEqual({ columns: 24, rows: 30 })
  expect(boxFor({ width: 2000, height: 200 }, 50).columns).toBe(44)
})

test('경로: Windows 드라이브·백슬래시·~·상대 경로', async () => {
  expect(resolvePath('C:\\a\\b.png', 'D:/x', 'C:\\Users\\me')).toBe('C:/a/b.png')
  expect(resolvePath('"C:/a b/c.png"', '', '')).toBe('C:/a b/c.png')
  expect(resolvePath('~/p.png', '', 'C:\\Users\\me')).toBe('C:/Users/me/p.png')
  expect(resolvePath('img/p.png', 'C:\\proj\\', '')).toBe('C:/proj/img/p.png')
  expect(resolvePath('/tmp/p.png', '/home', '')).toBe('/tmp/p.png')
})

test('붙여넣은 블록에서 이미지 데이터만 모은다', async () => {
  const content = [{ type: 'text', text: 'hi' }, { type: 'image', source: { type: 'base64', data: 'X' } }, { type: 'image', data: 'Y' }]
  expect(pngsIn(content)).toEqual(['X', 'Y'])
})

test('행 키는 uuid 앞 네 묶음', async () => {
  expect(rowKey('11111111-2222-3333-4444-000000000000')).toBe('11111111-2222-3333-4444')
  expect(rowKey('11111111-2222-3333-4444-555555555555')).toBe('11111111-2222-3333-4444')
})

test('결과 문자열에서 경로를 찾는다(공백·괄호, JSON 안)', async () => {
  expect(SHOWN.exec('Shown: C:/a (1)/b c.png (10x20)')?.[1]).toBe('C:/a (1)/b c.png')
  expect(SHOWN.exec(JSON.stringify([{ type: 'text', text: 'Shown: C:/x.png (1x1)' }]))?.[1]).toBe('C:/x.png')
})
