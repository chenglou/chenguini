import {afterAll, beforeAll, describe, expect, test} from 'bun:test'

import {runScenario, startHarness, type DemoReport} from './browserHarness'

let harness: Awaited<ReturnType<typeof startHarness>>

describe('drag-demo browser semantics', () => {
  beforeAll(async () => {
    harness = await startHarness()
  })

  afterAll(async () => {
    await harness?.close()
  })

  test(
    'page report shows reorder before release and keeps the released card on top while settling',
    async () => {
      const report = await runScenario(harness, 'midpoint-release')

      expectReadyReport(report)
      expect(report.reorderedDuringDrag).toBe(true)
      expect(report.initialOrder).toBeDefined()
      expect(report.orderedCardIdsAtRelease).toBeDefined()
      expect(report.orderedCardIdsAtRelease).not.toEqual(report.initialOrder)
      expect(report.topCardStayedReleasedDuringSettle).toBe(true)
      expect(report.topCardIdDuringSettle).toBe(report.releasedCardId)
    },
    30_000,
  )
})

function expectReadyReport(report: DemoReport) {
  expect(report.phase).toBe('ready')
  expect(report.message).toBeUndefined()
}
