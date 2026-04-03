import {afterAll, beforeAll, describe, expect, test} from 'bun:test'

import {
  runBrowserScenario,
  startBrowserTestServer,
  stopBrowserTestServer,
  type ScenarioReport,
} from './browserHarness'

type ServerHandle = Awaited<ReturnType<typeof startBrowserTestServer>>

describe.serial('photo gallery browser scenarios', () => {
  let server: ServerHandle | null = null

  beforeAll(async () => {
    server = await startBrowserTestServer()
  })

  afterAll(async () => {
    await stopBrowserTestServer(server)
  })

  async function scenario(name: string): Promise<ScenarioReport> {
    if (server == null) {
      throw new Error('Browser test server not started')
    }
    return runBrowserScenario(server.baseUrl, name)
  }

  test(
    'navigation flow keeps the hash in sync and locks grid scrolling while line mode is visible',
    async () => {
      const report = await scenario('navigation-flow')
      expect(report.data).toEqual({
        focusSequence: [2, 3, 4, 3],
        hashSequence: [
          '#photo=96ff81dd-fa46-43c0-b681-35b7cd8eb700%2F0_0',
          '#photo=077ddfbf-4f1a-437f-909e-073ec48beae0%2F0_0',
          '#photo=e1d06d80-68ca-4081-9ca2-73f5ba7333cc%2F0_3',
          '#photo=077ddfbf-4f1a-437f-909e-073ec48beae0%2F0_0',
        ],
        scrollTopBeforeLock: 560,
        scrollTopDuringLock: 560,
        dismissedHash: '',
        finalMode: 'grid',
      })
    },
    15_000,
  )

  test(
    'dismissing line mode scrolls the focused item back into view with a visible peek above it',
    async () => {
      const report = await scenario('dismiss-to-row')
      expect(report.data).toEqual({
        focusedIndex: 15,
        beforeDismissVisible: false,
        afterDismissVisible: true,
        topOffset: 40,
      })
    },
    15_000,
  )

  test(
    'clicking a grid caption selects the full caption text without entering line mode',
    async () => {
      const report = await scenario('caption-selection')
      expect(report.data).toEqual({
        selectedText:
          'Hourglass heart, liquid, grand canyon background, fleeting, ephemerality of time',
        hashAfterClick: '',
        modeAfterClick: 'grid',
      })
    },
    15_000,
  )
})
