import {afterAll, beforeAll, describe, expect, test} from 'bun:test'
import {existsSync} from 'node:fs'

import {startScenarioServer, stopScenarioServer, runScenario} from './browserTestUtils'

const roundDir = '/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/round-06'
const entryHtml = `${roundDir}/index.html`

describe('photo gallery browser scenarios', () => {
  beforeAll(async () => {
    expect(existsSync(entryHtml)).toBe(true)
    await startScenarioServer(entryHtml)
  })

  afterAll(async () => {
    await stopScenarioServer()
  })

  test(
    'navigates through line mode and keeps the hash in sync',
    async () => {
      const report = await runScenario('navigation-flow')

      expect(report.status).toBe('ok')
      expect(report.startedInGrid).toBe(true)
      expect(report.openedId).toBe(report.expectedOpenedId)
      expect(report.afterRightId).toBe(report.expectedRightId)
      expect(report.afterLeftId).toBe(report.expectedOpenedId)
      expect(report.scrollLockedInLineMode).toBe(true)
      expect(report.hashAfterOpen).toBe(`#${report.expectedOpenedId}`)
      expect(report.hashAfterDismiss).toBe('')
    },
    30_000,
  )

  test(
    'dismisses back to the focused row with a little space above it',
    async () => {
      const report = await runScenario('dismiss-to-row')

      expect(report.status).toBe('ok')
      expect(report.rowVisibleAfterDismiss).toBe(true)
      expect(report.peekAboveRow).toBeGreaterThanOrEqual(24)
      expect(report.peekAboveRow).toBeLessThanOrEqual(80)
      expect(report.hashAfterDismiss).toBe('')
    },
    30_000,
  )

  test(
    'clicking a grid caption selects the full caption and does not open line mode',
    async () => {
      const report = await runScenario('caption-selection')

      expect(report.status).toBe('ok')
      expect(report.focusedId).toBe(null)
      expect(report.hashAfterClick).toBe('')
      expect(report.selectedText).toBe(report.expectedText)
    },
    30_000,
  )
})
