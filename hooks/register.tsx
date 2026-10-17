import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { probe } from './probe'
import { addPending, isPendingRow, isPersonsPrompt, settlePending, textOf, wrapToWidth } from './wrap'

const pending = atom({ plugin: 'prompt-mark', key: 'pending' } as const, [])

const BAR = '▌ '

export const register: Register = (on, options) => {
  // Whether a main-loop turn is running: a prompt submitted meanwhile is queued.
  let isWorking = false
  // When each transcript row was first drawn (module memory: a reload starts it over).
  const firstSeen = new Map<string, number>()
  const barColor = typeof options.barColor === 'string' && options.barColor ? options.barColor : '#38bdf8'
  const textColor = typeof options.textColor === 'string' && options.textColor ? options.textColor : undefined
  const bgColor = typeof options.bgColor === 'string' && options.bgColor ? options.bgColor : undefined

  // The person's prompts are drawn with a coloured bar down their left edge and bold text;
  // every other user-role row (task notifications, other agents' messages) keeps the engine's look.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!isPersonsPrompt(e.props.origin)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    // Faint until sent: the submit placeholder, or a prompt still waiting in the queue.
    const queued = await read($, pending)
    const now = await $.clock.now()
    if (!firstSeen.has(e.requestId)) firstSeen.set(e.requestId, now)
    const isPending = e.requestId === 'placeholder' || isPendingRow(queued, e.props.text, firstSeen.get(e.requestId) ?? now)
    const columns = e.viewport?.columns ?? 80
    const width = Math.max(10, columns - BAR.length - 1)
    const lines = wrapToWidth(e.props.text, width)
    return (
      <Box flexDirection="column" marginTop={1}>
        {lines.map((line, i) => (
          // Full-width rows keep the engine's grey band behind the bar and text.
          <Box key={`l${i}`} flexDirection="row" width={columns} backgroundColor={bgColor}>
            <Text color={isPending ? undefined : barColor} dimColor={isPending || undefined}>{BAR}</Text>
            {isPending ? (
              <Text dimColor>{line || ' '}</Text>
            ) : (
              <Text bold color={textColor}>{line || ' '}</Text>
            )}
          </Box>
        ))}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) isWorking = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) isWorking = false
    return next(e)
  })

  // A prompt the person submits while Claude works waits in the queue until delivered.
  on('prompt.submit', async ($, e, next) => {
    // Read before next(e): submitting a prompt while idle starts the turn inside that call.
    const wasWorking = isWorking
    const submittedAt = await $.clock.now()
    const ran = await next(e)
    await probe($, { at: 'submit', wasWorking, command: e.command !== undefined, text: e.text.slice(0, 60) })
    if (wasWorking && e.command === undefined && !e.isMeta && isPersonsPrompt(e.origin)) {
      await update($, pending, list => addPending(list, e.text, submittedAt))
    }
    return ran
  }).catch(($, e, next) => next(e))

  // Queue records and the rows that deliver them tell which typed prompts are still waiting.
  on('session.append', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined && (e.door === 'queue' || e.door === 'delivery' || e.door === 'prompt')) {
      await probe($, { door: e.door, origin: e.origin, type: e.message.type, text: textOf(e.message.content).slice(0, 60) })
    }
    if (e.agentId === undefined && isPersonsPrompt('kind' in e.origin ? { kind: e.origin.kind } : undefined)) {
      const text = textOf(e.message.content)
      await update($, pending, list => settlePending(list, e.door, text))
    }
    return ran
  }).catch(($, e, next) => next(e))
}
