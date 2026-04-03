import { expect, test } from 'bun:test'

import { runScenario } from './browser-test-helpers.js'

test(
  'browser report proves reorder-before-release and top-until-settle',
  async () => {
    const report = await runScenario('drag-second-card-down')

    expect(report.releasedCardId).toBe('card-1')
    expect(report.orderBeforeRelease).toEqual(['card-0', 'card-2', 'card-1', 'card-3', 'card-4'])
    expect(report.topCardIdWhileSettling).toBe('card-1')
    expect(report.topCardIdAfterSettle).toBe('card-4')
  },
  30_000,
)
