export type GalleryServer = {
  baseUrl: string
  close: () => void
}

const port = 4173
const host = '127.0.0.1'

async function waitForServer(baseUrl: string) {
  const deadline = Date.now() + 10_000
  const probeUrl = new URL('/index.html', baseUrl).href

  while (Date.now() < deadline) {
    try {
      const response = await fetch(probeUrl)
      if (response.ok) {
        return
      }
    } catch {
      // Retry until the local Bun server is ready.
    }

    await Bun.sleep(100)
  }

  throw new Error(`Timed out waiting for ${baseUrl}`)
}

export async function startGalleryServer(): Promise<GalleryServer> {
  const cwd = '/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/overlay-oracle-contract'
  const proc = Bun.spawn({
    cmd: ['bun', 'index.html', `--host=${host}`, `--port=${port}`],
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const baseUrl = `http://${host}:${port}`
  await waitForServer(baseUrl)

  return {
    baseUrl,
    close: () => {
      proc.kill()
    },
  }
}
