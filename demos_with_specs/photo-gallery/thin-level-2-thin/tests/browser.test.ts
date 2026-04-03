import { afterAll, beforeAll, describe, expect, test } from 'bun:test'

import { photoGalleryData } from '../data'
import { hashForPhoto } from '../model'
import { runBrowserScenario, startDemoServer, type ScenarioReport } from './browserHarness'

type DemoServer = Awaited<ReturnType<typeof startDemoServer>>

describe('photo gallery browser semantics', () => {
  let server: DemoServer | null = null

  beforeAll(async () => {
    server = await startDemoServer()
  })

  afterAll(async () => {
    if (server !== null) {
      await server.stop()
    }
  })

  test(
    'hash sync keeps the focused image in window.location.hash',
    async () => {
      const report = await runBrowserScenario(server!, 'hash-sync')

      expect(report.openedHash).toBe(hashForPhoto(photoGalleryData[0]!.id))
      expect(report.advancedHash).toBe(hashForPhoto(photoGalleryData[1]!.id))
      expect(report.programmaticFocusId).toBe(photoGalleryData[5]!.id)
      expect(report.clearedHash).toBe('')
    },
    35_000,
  )

  test(
    'caption click selects the full prompt and stays in grid mode',
    async () => {
      const report = await runBrowserScenario(server!, 'caption-selection')

      expect(report.mode).toBe('grid')
      expect(report.selectedText).toBe(photoGalleryData[0]!.prompt)
      expect(report.clearedHash).toBe('')
    },
    35_000,
  )

  test(
    'dismiss restore brings the focused row back to about 40px from the top',
    async () => {
      const report = await runBrowserScenario(server!, 'dismiss-restore', {width: 1_440, height: 900})

      expect(report.mode).toBe('grid')
      expect(report.restoredTop).toBeGreaterThanOrEqual(28)
      expect(report.restoredTop).toBeLessThanOrEqual(52)
      expect(report.restoreDelta).toBeLessThanOrEqual(12)
    },
    35_000,
  )

  test(
    'occlusion mounts fewer cards than the full data set',
    async () => {
      const report = await runBrowserScenario(server!, 'occlusion', {width: 1_440, height: 720})

      expect(report.totalCount).toBe(photoGalleryData.length)
      expect(report.mountedCount).toBeLessThan(photoGalleryData.length)
      expect(report.visibleRowRange).toBeDefined()
    },
    35_000,
  )
})
