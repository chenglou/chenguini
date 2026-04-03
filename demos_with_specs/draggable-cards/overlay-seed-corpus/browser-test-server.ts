const PORT = 3347
const BASE_URL = `http://127.0.0.1:${PORT}`
const INDEX_HTML = '/Users/chenglou/github/vibescript/demos_with_specs/draggable-cards/overlay-seed-corpus/index.html'

type DemoServer = {
  url: string
  stop: () => Promise<void>
}

let serverProcess: ReturnType<typeof Bun.spawn> | null = null
let serverStartPromise: Promise<DemoServer> | null = null
let serverRefCount = 0

async function waitForServer() {
  const deadline = Date.now() + 15_000
  let lastError: unknown = null

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE_URL}/index.html`)
      if (response.ok) {
        return
      }
    } catch (error) {
      lastError = error
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw lastError instanceof Error ? lastError : new Error('demo server did not start')
}

async function startServerProcess() {
  if (serverProcess) {
    return
  }

  serverProcess = Bun.spawn({
    cmd: [
      process.execPath,
      INDEX_HTML,
      '--host=127.0.0.1',
      `--port=${PORT}`,
    ],
    stdout: 'ignore',
    stderr: 'ignore',
  })

  await waitForServer()
}

export async function startDemoServer(): Promise<DemoServer> {
  serverRefCount += 1

  if (!serverStartPromise) {
    serverStartPromise = (async () => {
      try {
        await startServerProcess()
        return {
          url: BASE_URL,
          stop: async () => {
            serverRefCount -= 1
            if (serverRefCount > 0) {
              return
            }

            const process = serverProcess
            serverProcess = null
            serverStartPromise = null
            if (!process) {
              return
            }

            process.kill()
            await process.exited.catch(() => undefined)
          },
        }
      } catch (error) {
        serverRefCount -= 1
        serverProcess?.kill()
        serverProcess = null
        serverStartPromise = null
        throw error
      }
    })()
  }

  return serverStartPromise
}
