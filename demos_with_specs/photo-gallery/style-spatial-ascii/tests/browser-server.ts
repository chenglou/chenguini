import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createServer } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

const roundDir = '/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/style-spatial-ascii'

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address == null || typeof address === 'string') {
        reject(new Error('Failed to reserve a test port'))
        return
      }
      const port = address.port
      server.close((closeErr) => {
        if (closeErr != null) {
          reject(closeErr)
          return
        }
        resolve(port)
      })
    })
  })
}

async function waitForServer(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl)
      if (response.ok) return
    } catch {
      // keep polling
    }
    await delay(100)
  }
  throw new Error('Timed out waiting for the gallery server')
}

export async function startGalleryServer(): Promise<{
  baseUrl: string
  stop: () => Promise<void>
}> {
  const port = await getFreePort()
  const child: ChildProcessWithoutNullStreams = spawn(
    'bun',
    ['index.html', `--host=127.0.0.1`, `--port=${port}`],
    {cwd: roundDir, stdio: ['ignore', 'pipe', 'pipe']},
  )

  child.stdout.on('data', () => {})
  child.stderr.on('data', () => {})

  const baseUrl = `http://127.0.0.1:${port}`
  await waitForServer(`${baseUrl}/index.html`)

  return {
    baseUrl,
    stop: async () => {
      child.kill('SIGTERM')
      await delay(100)
      if (!child.killed) child.kill('SIGKILL')
    },
  }
}
