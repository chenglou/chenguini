import {afterAll, beforeAll, describe, expect, test} from 'bun:test'
import {runScenarioInChrome, startDemoServer} from './browser-harness'

const rootDir = import.meta.dir

let server: Awaited<ReturnType<typeof startDemoServer>>

beforeAll(async () => {
  server = await startDemoServer(rootDir)
})

afterAll(() => {
  server.stop()
})

describe('browser scenarios', () => {
  test('scroll-to-700 then add-3-above keeps the same item at the reference line', async () => {
    const report = await runScenarioInChrome({
      baseUrl: server.baseUrl,
      scenario: 'scroll-to-700-add-3-above',
    })

    expect(report.beforeReferenceItemId).toBe('V9')
    expect(report.afterReferenceItemId).toBe('V9')
    expect(report.anchorAfterActionId).toBe('V8')
    expect(report.mountedItemCount).toBeLessThan(report.itemCount)
    expect(report.mountedHeaderCount).toBeLessThanOrEqual(3)
  }, 20000)

  test('add-1 then 2 rapid keeps the same item at the reference line', async () => {
    const report = await runScenarioInChrome({
      baseUrl: server.baseUrl,
      scenario: 'add-1-then-2-rapid',
    })

    expect(report.beforeReferenceItemId).toBe('V9')
    expect(report.afterReferenceItemId).toBe('V9')
    expect(report.anchorAfterActionId).toBe('V8')
    expect(report.mountedItemCount).toBeLessThan(report.itemCount)
  }, 20000)

  test('user-scroll then prepend picks a new anchor from the new scroll position', async () => {
    const report = await runScenarioInChrome({
      baseUrl: server.baseUrl,
      scenario: 'user-scroll-then-prepend',
    })

    expect(report.anchorBeforeUserScrollId).toBe('V1')
    expect(report.anchorAfterUserScrollId).toBe('V10')
    expect(report.anchorAfterActionId).toBe('V10')
    expect(report.beforeReferenceItemId).toBe('V11')
    expect(report.afterReferenceItemId).toBe('V11')
  }, 20000)
})
