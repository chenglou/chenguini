import {afterAll, beforeAll, describe, expect, test} from 'bun:test'
import {runScenario, startDemoServer, type ServerHandle} from './browserHarness'

const cwd = '/Users/chenglou/github/vibescript/demos_with_specs/gesture-flick-snap-target/round-01-template'

describe('browser semantics', () => {
  let server: ServerHandle | null = null

  beforeAll(async () => {
    server = await startDemoServer(cwd)
  })

  afterAll(async () => {
    await server?.stop()
  })

  test(
    'drag keeps the PiP under the pointer before release',
    async () => {
      const report = await runScenario(server!.baseUrl, 'drag-under-pointer')

      expect(report.scenario).toBe('drag-under-pointer')
      expect(report.maxPointerError).toBeLessThanOrEqual(1.5)
    },
    30_000,
  )

  test(
    'fast flick toward the upper-right lands at the upper-right corner',
    async () => {
      const report = await runScenario(server!.baseUrl, 'flick-upper-right')

      expect(report.scenario).toBe('flick-upper-right')
      expect(report.chosenCorner).toBe('topRight')
      expect(report.finalCorner).toBe('topRight')
    },
    30_000,
  )

  test(
    'slower release toward the lower-right lands at the lower-right corner and reports a blue rest point',
    async () => {
      const report = await runScenario(server!.baseUrl, 'slow-lower-right')

      expect(report.scenario).toBe('slow-lower-right')
      expect(report.chosenCorner).toBe('bottomRight')
      expect(report.finalCorner).toBe('bottomRight')
      expect(report.restPoint).toEqual({
        x: expect.any(Number),
        y: expect.any(Number),
      })
    },
    30_000,
  )
})
