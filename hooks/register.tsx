import type { Register } from 'claude-code'

import { isPersonsPrompt, wrapToWidth } from './wrap'

const BAR = '▌ '

export const register: Register = (on, options) => {
  const barColor = typeof options.barColor === 'string' && options.barColor ? options.barColor : '#38bdf8'
  const textColor = typeof options.textColor === 'string' && options.textColor ? options.textColor : undefined
  const bgColor = typeof options.bgColor === 'string' && options.bgColor ? options.bgColor : undefined

  // The person's prompts are drawn with a coloured bar down their left edge and bold text;
  // every other user-role row (task notifications, other agents' messages) keeps the engine's look.
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!isPersonsPrompt(e.props.origin)) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    // A prompt typed while Claude works waits in the queue, drawn under the id 'placeholder':
    // faint until it is sent.
    const isPending = e.requestId === 'placeholder'
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
}
