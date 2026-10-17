import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { probe } from './probe'
import { addPending, commandLine, commandNameIn, isPendingRow, isPersonsPrompt, isQueuedCommandRow, settlePending, textOf, wrapToWidth } from './wrap'

const pending = atom({ plugin: 'prompt-mark', key: 'pending' } as const, [])
// Bumped when queued commands are released, so their rows redraw.
const release = atom({ plugin: 'prompt-mark', key: 'release' } as const, 0)

const BAR = '▌ '

// Releases queued command rows (all, or those of one command) and redraws them.
async function releaseCommands($: EngineInterface, queued: Map<string, string>, name?: string): Promise<void> {
  for (const [id, text] of queued) {
    if (name === undefined || text === name || text.startsWith(`${name} `)) queued.delete(id)
  }
  await update($, release, n => n + 1)
}

export const register: Register = (on, options) => {
  // Whether a main-loop turn is running: a prompt submitted meanwhile is queued.
  let isWorking = false
  // When each transcript row was first drawn (module memory: a reload starts it over).
  const firstSeen = new Map<string, number>()
  // Command rows first drawn while a turn ran: requestId -> their text. Module memory only.
  const queuedCommands = new Map<string, string>()
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
    await read($, release)
    const now = await $.clock.now()
    if (!firstSeen.has(e.requestId)) {
      firstSeen.set(e.requestId, now)
      if (isQueuedCommandRow(e.props.text, isWorking)) queuedCommands.set(e.requestId, e.props.text)
    }
    const isPending =
      e.requestId === 'placeholder' ||
      queuedCommands.has(e.requestId) ||
      isPendingRow(queued, e.props.text, firstSeen.get(e.requestId) ?? now)
    await probe($, { at: 'render', requestId: e.requestId, text: e.props.text.slice(0, 40), isPending, queued: queued.length, onScreen: e.props.onScreen ?? null })
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

  // Queued commands run once the turn is over: nothing stays faint past it.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      isWorking = false
      await releaseCommands($, queuedCommands)
    }
    return next(e)
  })

  // A prompt the person submits while Claude works waits in the queue until delivered.
  on('prompt.submit', async ($, e, next) => {
    // Read before next(e): submitting a prompt while idle starts the turn inside that call.
    const wasWorking = isWorking
    const submittedAt = await $.clock.now()
    const ran = await next(e)
    await probe($, { at: 'submit', wasWorking, command: e.command !== undefined, text: e.text.slice(0, 60) })
    if (wasWorking && !e.isMeta && isPersonsPrompt(e.origin)) {
      const text = e.command ? commandLine(e.command.name, e.command.args) : e.text
      await update($, pending, list => addPending(list, text, submittedAt))
    }
    return ran
  }).catch(($, e, next) => next(e))

  // Queue records and the rows that deliver them tell which typed prompts are still waiting.
  on('session.append', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId === undefined) {
      await probe($, { door: e.door, origin: e.origin, type: e.message.type, text: textOf(e.message.content).slice(0, 60) })
    }
    // A queued slash command stops waiting when the engine records that it ran.
    if (e.agentId === undefined && e.door === 'command') {
      const name = commandNameIn(textOf(e.message.content))
      if (name !== undefined) {
        await releaseCommands($, queuedCommands, name)
        await update($, pending, list => list.filter(p => p.text !== name && !p.text.startsWith(`${name} `)))
      }
    }
    if (e.agentId === undefined && isPersonsPrompt('kind' in e.origin ? { kind: e.origin.kind } : undefined)) {
      const text = textOf(e.message.content)
      await update($, pending, list => settlePending(list, e.door, text))
    }
    return ran
  }).catch(($, e, next) => next(e))
}
