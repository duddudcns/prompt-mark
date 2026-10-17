import { expect, test } from 'claude-code/testing'

import { displayWidth, isPersonsPrompt, settlePending, textOf, wrapToWidth } from './wrap'

test('표시 폭: 영문 1칸, 한글 2칸', async () => {
  expect(displayWidth('ab')).toBe(2)
  expect(displayWidth('가나')).toBe(4)
})

test('줄바꿈은 그대로 줄이 되고, 빈 줄도 남는다', async () => {
  expect(wrapToWidth('a\n\nb', 10)).toEqual(['a', '', 'b'])
})

test('폭을 넘는 줄은 띄어쓰기에서 끊는다', async () => {
  expect(wrapToWidth('hello brave new world', 11)).toEqual(['hello brave', 'new world'])
})

test('띄어쓰기 없이 긴 단어는 폭에서 자른다, 한글은 2칸으로 센다', async () => {
  expect(wrapToWidth('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij'])
  expect(wrapToWidth('가나다라마', 4)).toEqual(['가나', '다라', '마'])
})

test('모든 줄이 폭을 넘지 않는다', async () => {
  const lines = wrapToWidth('서브에이전트 패널 테스트 문장입니다 and some english words mixed in', 13)
  for (const line of lines) expect(displayWidth(line)).toBeLessThanOrEqual(13)
})

test('사람이 직접 친 프롬프트만 표시한다 (작업 알림·다른 에이전트 메시지는 제외)', async () => {
  expect(isPersonsPrompt({ kind: 'composer' })).toBe(true)
  expect(isPersonsPrompt({ kind: 'bridge' })).toBe(true)
  expect(isPersonsPrompt({ kind: 'task-notification' })).toBe(false)
  expect(isPersonsPrompt({ kind: 'peer' })).toBe(false)
})

test('행 본문은 텍스트 블록만 이어 붙인다', async () => {
  expect(textOf([{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }])).toBe('a\nb')
})

test('대기열 기록이면 대기 목록에 넣고, 실제 전달(prompt/delivery)이면 뺀다', async () => {
  expect(settlePending([], 'queue', 'hi')).toEqual(['hi'])
  expect(settlePending(['hi'], 'queue', 'hi')).toEqual(['hi'])
  expect(settlePending(['hi', 'yo'], 'delivery', 'hi')).toEqual(['yo'])
  expect(settlePending(['hi'], 'prompt', 'hi')).toEqual([])
  expect(settlePending(['hi'], 'response', 'hi')).toEqual(['hi'])
  // A prompt delivered into a running turn arrives wrapped in a reminder.
  const wrapped = ['<system-reminder>', 'The user sent a new message while you were working:', '테스트', '</system-reminder>'].join('\n')
  expect(settlePending(['테스트'], 'delivery', wrapped)).toEqual([])
})
