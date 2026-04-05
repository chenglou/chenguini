import {describe, expect, test} from 'bun:test'

import {photoGalleryData} from './data'
import {runBrowserScenario} from './browserHarness'

describe('photo gallery browser flows', () => {
  test(
    'hash navigation enters line mode and lands on the focused item',
    async () => {
      const report = await runBrowserScenario({
        scenario: 'hash-navigation',
        viewport: {width: 1440, height: 960},
      })

      expect(report.mode).toBe('line')
      expect(report.focusedId).toBe(photoGalleryData[6]!.id)
      expect(report.hash).toBe(`#${photoGalleryData[6]!.id}`)
    },
    30_000,
  )

  test(
    'caption click selects the full prompt and stays in grid mode',
    async () => {
      const report = await runBrowserScenario({
        scenario: 'caption-selection',
        viewport: {width: 1280, height: 900},
      })

      expect(report.mode).toBe('grid')
      expect(report.selectedText).toBe(photoGalleryData[4]!.prompt)
      expect(report.hash).toBe('')
    },
    30_000,
  )

  test(
    'dismiss restore leaves about 40px above the focused row',
    async () => {
      const report = await runBrowserScenario({
        scenario: 'dismiss-restore',
        viewport: {width: 1280, height: 900},
      })

      expect(report.mode).toBe('grid')
      expect(report.focusedId).toBe(photoGalleryData[16]!.id)
      expect(report.gapAboveRow).toBeDefined()
      expect(report.gapAboveRow!).toBeGreaterThanOrEqual(32)
      expect(report.gapAboveRow!).toBeLessThanOrEqual(48)
    },
    30_000,
  )

  test(
    'grid occlusion mounts fewer cards than the full data set',
    async () => {
      const report = await runBrowserScenario({
        scenario: 'occlusion',
        viewport: {width: 1024, height: 780},
      })

      expect(report.totalCount).toBe(photoGalleryData.length)
      expect(report.mountedCount).toBeDefined()
      expect(report.mountedCount!).toBeGreaterThan(0)
      expect(report.mountedCount!).toBeLessThan(photoGalleryData.length)
    },
    30_000,
  )
})
