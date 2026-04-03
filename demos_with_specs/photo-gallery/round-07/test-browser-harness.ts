import { mkdtemp, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const roundDir =
  '/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/round-07'
const chromePath =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const serverPort = 34803

let serverProcess: Bun.Subprocess | null = null
let serverOrigin = `http://localhost:${serverPort}/`

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  status: 'ok' | 'error'
  scenario: string
  requestId: string
  message?: string
  focusSequence?: Array<string | null>
  hashSequence?: string[]
  bodyOverflowWhileLineMode?: string
  gridMountedCount?: number
  rowVisibleAfterDismiss?: boolean
  rowTopAfterDismiss?: number
  selectedText?: string
  focusedId?: string | null
  hash?: string
}

export async function runScenarioInBrowser(scenario: string) {
  await ensureStaticServer()

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const outputDir = await mkdtemp(join(tmpdir(), 'photo-gallery-round-07-'))
  const outputPath = join(outputDir, `${scenario}.html`)
  const url = `${serverOrigin}?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`

  const chrome = Bun.spawn(
    [
      chromePath,
      '--headless=new',
      '--disable-gpu',
      '--allow-file-access-from-files',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=12000',
      '--window-size=1440,1200',
      '--dump-dom',
      url,
    ],
    {
      cwd: roundDir,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )

  const stdout = await new Response(chrome.stdout).text()
  const stderr = await new Response(chrome.stderr).text()
  const exitCode = await chrome.exited

  await Bun.write(outputPath, stdout)

  if (exitCode !== 0) {
    throw new Error(
      `Chrome failed for scenario "${scenario}" with exit ${exitCode}\n${stderr}`,
    )
  }

  const report = await readScenarioReport(outputPath)
  if (report.requestId !== requestId) {
    throw new Error(
      `Scenario "${scenario}" reported requestId ${report.requestId} instead of ${requestId}`,
    )
  }
  if (report.phase !== 'ready' || report.status !== 'ok') {
    throw new Error(
      `Scenario "${scenario}" did not finish cleanly: ${JSON.stringify(report)}`,
    )
  }

  return outputPath
}

export async function readScenarioReport(outputPath: string) {
  const html = await readFile(outputPath, 'utf8')
  const match = html.match(
    /<script id="scenario-report" type="application\/json">([\s\S]*?)<\/script>/,
  )
  if (match == null || match[1] == null) {
    throw new Error(`Missing scenario report in ${outputPath}`)
  }
  return JSON.parse(match[1]) as ScenarioReport
}

export async function stopStaticServer() {
  if (serverProcess == null) return
  serverProcess.kill()
  await serverProcess.exited
  serverProcess = null
}

async function ensureStaticServer() {
  if (serverProcess != null) return

  serverProcess = Bun.spawn(
    ['bun', '--port', String(serverPort), '--no-hmr', `${roundDir}/index.html`],
    {
      cwd: roundDir,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  )

  const deadline = Date.now() + 10_000
  let lastError = ''

  while (Date.now() < deadline) {
    for (const candidate of [
      `http://localhost:${serverPort}/`,
      `http://127.0.0.1:${serverPort}/`,
      `http://[::1]:${serverPort}/`,
    ]) {
      try {
        const response = await fetch(candidate)
        if (response.ok) {
          serverOrigin = candidate
          return
        }
      } catch (error) {
        lastError = String(error)
      }
    }
    await Bun.sleep(100)
  }

  const stderr = await new Response(serverProcess.stderr).text()
  await stopStaticServer()
  throw new Error(`Timed out waiting for server.\n${lastError}\n${stderr}`)
}
