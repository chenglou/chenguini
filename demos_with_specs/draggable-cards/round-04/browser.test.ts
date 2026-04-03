import { describe, expect, test } from 'bun:test'
import { runBrowserScenario } from './browserTestHarness'

describe('draggable cards browser semantics', () => {
  test('scripted drag reorders cards live', async () => {
    const result = await runBrowserScenario(async (session) => {
      await session.waitForReport(
        (report) => report.phase === 'idle' && report.orderedCardIds.join(',') === '0,1,2,3,4',
        'initial idle report',
      )

      const start = await session.getCardCenter(0)
      await session.pointerMove(start.x, start.y)
      await session.pointerDown(start.x, start.y)
      await session.pointerMove(start.x, start.y + 180, { steps: 14 })

      return session.waitForReport(
        (report) =>
          report.phase === 'dragging' &&
          report.draggedId === 0 &&
          report.swapCount >= 1 &&
          report.orderedCardIds.join(',') === '1,0,2,3,4',
        'live reorder while dragging',
      )
    })

    expect(result.orderedCardIds).toEqual([1, 0, 2, 3, 4])
    expect(result.draggedId).toBe(0)
    expect(result.swapCount).toBeGreaterThanOrEqual(1)
  }, 30_000)

  test('released card stays visually above the others while settling', async () => {
    const settlingReport = await runBrowserScenario(async (session) => {
      await session.waitForReport((report) => report.phase === 'idle', 'initial idle report')

      const start = await session.getCardCenter(0)
      await session.pointerMove(start.x, start.y)
      await session.pointerDown(start.x, start.y)
      await session.pointerMove(start.x + 80, start.y + 220, { steps: 10 })
      await session.pointerUp(start.x + 120, start.y + 260)

      return session.waitForReport(
        (report) =>
          report.phase === 'settling' &&
          report.draggedId == null &&
          report.lastDraggedId === 0 &&
          report.zOrder[0] === 0,
        'released card depth while settling',
      )
    })

    expect(settlingReport.lastDraggedId).toBe(0)
    expect(settlingReport.draggedId).toBeNull()
    expect(settlingReport.phase).toBe('settling')
    expect(settlingReport.zOrder[0]).toBe(0)
  }, 30_000)
})
