import { expect, test } from 'bun:test'

import { runBrowserScenario } from './browserTestUtils'

test(
  'reorders before release in the real page flow',
  async () => {
    const report = await runBrowserScenario('reorder-before-release')

    expect(report.orderedCardIds).toEqual([0, 2, 1, 3, 4])
    expect(report.lastDraggedId).toBe(2)
    expect(report.reorderedBeforeRelease).toBe(true)
  },
  30_000,
)

test(
  'keeps the released card on top until it settles',
  async () => {
    const report = await runBrowserScenario('top-until-settle')

    expect(report.releasedCardId).toBe(2)
    expect(report.stayedOnTopUntilSettle).toBe(true)
  },
  30_000,
)
