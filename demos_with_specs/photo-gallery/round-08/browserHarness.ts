import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 34803
const roundDir = '/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/round-08'
const indexHtmlPath = `${roundDir}/index.html`

export type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  status?: 'ok' | 'error'
  data?: unknown
  message?: string
}

type ServerHandle = {
  process: Bun.Subprocess
  baseUrl: string
}

async function waitForServer(baseUrl: string) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 1_500) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) {
        return
      }
    } catch {}
    await Bun.sleep(100)
  }
  throw new Error(`Timed out waiting for ${baseUrl}`)
}

export async function startBrowserTestServer(): Promise<ServerHandle> {
  const server = Bun.spawn(['bun', '--port', String(port), '--no-hmr', indexHtmlPath], {
    cwd: roundDir,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const loopbackHosts = ['localhost', '127.0.0.1', '[::1]']
  for (const host of loopbackHosts) {
    const baseUrl = `http://${host}:${port}/`
    try {
      await waitForServer(baseUrl)
      return {process: server, baseUrl}
    } catch {}
  }

  server.kill()
  throw new Error('Could not reach the Bun page server on any loopback hostname')
}

export async function stopBrowserTestServer(server: ServerHandle | null) {
  if (server == null) {
    return
  }
  server.process.kill()
  await server.process.exited
}

function extractScenarioReport(dom: string): ScenarioReport {
  const match = dom.match(
    /<script id="scenario-report" type="application\/json">([\s\S]*?)<\/script>/,
  )
  if (match == null) {
    throw new Error(`Missing scenario report in DOM:\n${dom}`)
  }
  return JSON.parse(match[1]) as ScenarioReport
}

async function readScenarioReportFromStdout(browser: Bun.Subprocess) {
  const stdout = browser.stdout
  if (stdout == null) {
    throw new Error('Chrome did not expose stdout')
  }

  const reader = stdout.getReader()
  const decoder = new TextDecoder()
  let dom = ''

  while (true) {
    const {done, value} = await reader.read()
    if (value != null) {
      dom += decoder.decode(value, {stream: !done})
      if (dom.includes('<script id="scenario-report" type="application/json">')) {
        return extractScenarioReport(dom)
      }
    }

    if (done) {
      break
    }
  }

  throw new Error(`Chrome exited before printing a scenario report:\n${dom}`)
}

export async function runBrowserScenario(baseUrl: string, scenario: string): Promise<ScenarioReport> {
  const requestId = `${scenario}-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const userDataDir = await mkdtemp(join(tmpdir(), 'photo-gallery-round-08-'))
  const url = `${baseUrl}?report=1&scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`

  try {
    const browser = Bun.spawn(
      [
        chromePath,
        '--headless=new',
        '--disable-gpu',
        '--window-size=1400,700',
        '--force-device-scale-factor=1',
        '--run-all-compositor-stages-before-draw',
        '--virtual-time-budget=1800',
        `--user-data-dir=${userDataDir}`,
        '--dump-dom',
        url,
      ],
      {
        cwd: roundDir,
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )

    const report = await readScenarioReportFromStdout(browser)
    browser.kill()
    await browser.exited
    if (report.requestId !== requestId) {
      throw new Error(`Mismatched requestId. Expected ${requestId}, got ${report.requestId}`)
    }
    if (report.phase !== 'ready') {
      throw new Error(`Scenario did not finish. Last report:\n${JSON.stringify(report, null, 2)}`)
    }
    if (report.status !== 'ok') {
      throw new Error(`Scenario failed:\n${JSON.stringify(report, null, 2)}`)
    }
    return report
  } finally {
    await rm(userDataDir, {force: true, recursive: true})
  }
}
