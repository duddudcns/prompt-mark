import { expect, mock, test } from 'claude-code/testing'

const PLUGIN = 'prompt-mark'

const props = (text: string, kind: string) => ({ text, origin: { kind }, isExpanded: true }) as never

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: 내 프롬프트는 줄마다 막대가 붙고 굵게, 강조색으로 그린다`, async ($, on) => {
    mock.clock(on)
    on('ui.render', async () => null as never)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'UserMessage', props: props('첫 줄\n둘째 줄', 'composer'), viewport: { columns: 40, rows: 20 } as never })
    const texts = await ui.findAll({ type: 'Text' })
    expect(texts.filter(t => t.text === '▌ ')).toHaveLength(2)
    const body = texts.filter(t => t.text === '첫 줄' || t.text === '둘째 줄')
    expect(body).toHaveLength(2)
    for (const t of body) {
      expect(t.props.bold).toBe(true)
      expect(t.props.color).toBe('#7dd3fc')
    }
    // Each line keeps the grey band across the full width.
    const rowsDrawn = (await ui.findAll({ type: 'Box' })).filter(b => b.props.flexDirection === 'row')
    expect(rowsDrawn).toHaveLength(2)
    for (const r of rowsDrawn) {
      expect(r.props.backgroundColor).toBe('#373737')
      expect(r.props.width).toBe(40)
    }
  })
}

test('긴 프롬프트는 감싼 줄마다 막대가 이어진다', async ($, on) => {
  mock.clock(on)
  on('ui.render', async () => null as never)
  const long = 'word '.repeat(30).trim()
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'UserMessage', props: props(long, 'composer'), viewport: { columns: 30, rows: 20 } as never })
  const bars = (await ui.findAll({ type: 'Text' })).filter(t => t.text === '▌ ')
  expect(bars.length).toBeGreaterThan(4)
})

test('옵션으로 막대·글자 색을 바꾼다', { options: { barColor: 'magenta', textColor: 'yellow' } }, async ($, on) => {
  mock.clock(on)
  on('ui.render', async () => null as never)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'UserMessage', props: props('hi', 'composer'), viewport: { columns: 40, rows: 20 } as never })
  const texts = await ui.findAll({ type: 'Text' })
  expect(texts.find(t => t.text === '▌ ')?.props.color).toBe('magenta')
  expect(texts.find(t => t.text === 'hi')?.props.color).toBe('yellow')
})

test('아직 대기 중인 메시지(placeholder 행)는 흐리게 그린다', async ($, on) => {
  mock.clock(on)
  on('ui.render', async () => null as never)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'UserMessage', requestId: 'placeholder', props: props('queued one', 'composer'), viewport: { columns: 40, rows: 20 } as never })
  const texts = await ui.findAll({ type: 'Text' })
  const body = texts.find(t => t.text === 'queued one')
  expect(body?.props.dimColor).toBe(true)
  expect(body?.props.color).toBeUndefined()
  expect(body?.props.bold).toBeUndefined()
  expect(texts.find(t => t.text === '▌ ')?.props.dimColor).toBe(true)
})

test('작업 중에 보낸 메시지만 흐리고(같은 글자의 이전 행은 그대로), 전달되면 강조색으로 돌아온다', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.render', async () => null as never)
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  const mount = (requestId: string) =>
    $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'UserMessage', requestId, props: props('wait for me', 'composer'), viewport: { columns: 40, rows: 20 } as never })
  const bodyOf = async (ui: Awaited<ReturnType<typeof mount>>) => (await ui.findAll({ type: 'Text' })).find(t => t.text === 'wait for me')

  // An earlier prompt with the same words, already on screen.
  const old = await mount('old1')
  await clock.advance(1000)
  await $.turn.start({ text: 'go', turnId: 't1' } as never)
  await $.prompt.submit({ text: 'wait for me', origin: { kind: 'composer' } } as never)
  await clock.advance(10)
  const queued = await mount('new1')
  expect((await bodyOf(queued))?.props.dimColor).toBe(true)
  expect((await bodyOf(old))?.props.bold).toBe(true)

  await $.session.append({
    message: { type: 'attachment', content: [{ type: 'text', text: '<system-reminder>\nThe user sent a new message while you were working:\nwait for me\n</system-reminder>' }] },
    door: 'delivery', origin: { kind: 'composer' }, uuid: 'u1',
  } as never)
  expect((await bodyOf(queued))?.props.dimColor).toBeUndefined()
  expect((await bodyOf(queued))?.props.bold).toBe(true)
})

test('작업 중에 보낸 명령어도 흐리고, 명령이 실행되면 대기 목록에서 빠진다', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.render', async () => null as never)
  on('turn.start', async (_$, e) => ({ turnId: e.turnId }))
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  on('command.run', async () => ({ text: 'ran' }))
  await $.turn.start({ text: 'go', turnId: 't1' } as never)
  await $.prompt.submit({ text: '/sap', origin: { kind: 'composer' }, command: { name: 'sap', args: '' } } as never)
  await clock.advance(10)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'UserMessage', requestId: 'c1', props: props('/sap', 'composer'), viewport: { columns: 40, rows: 20 } as never })
  const body = async () => (await ui.findAll({ type: 'Text' })).find(t => t.text === '/sap')
  expect((await body())?.props.dimColor).toBe(true)
  await $.command.run({ command: 'sap', args: '' } as never)
  expect((await body())?.props.bold).toBe(true)
})

test('작업 알림 행은 엔진 기본 모양 그대로 둔다', async ($, on) => {
  mock.clock(on)
  // The test's hook stands for the engine's own drawing.
  on('ui.render', async ($$, e) => {
    const { Text } = $$.ui.resolve(e)
    return <Text>engine row</Text>
  })
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'UserMessage', props: props('<task-notification>', 'task-notification'), viewport: { columns: 40, rows: 20 } as never })
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  expect(texts).toContain('engine row')
  expect(texts).not.toContain('▌ ')
})
