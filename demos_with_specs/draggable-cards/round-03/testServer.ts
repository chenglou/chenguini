const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'browser' })

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ts': 'text/javascript; charset=utf-8',
}

function sanitizePath(url: URL) {
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname
  const resolved = Bun.resolveSync(`.${pathname}`, import.meta.dir)
  if (!resolved.startsWith(import.meta.dir)) {
    throw new Error(`Refusing to serve path outside round folder: ${pathname}`)
  }
  return resolved
}

function contentTypeFor(path: string) {
  if (path.endsWith('.ts')) return MIME_TYPES['.ts']
  if (path.endsWith('.html')) return MIME_TYPES['.html']
  if (path.endsWith('.json')) return MIME_TYPES['.json']
  return MIME_TYPES['.js']
}

export function startRoundServer() {
  return Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      let path: string
      try {
        path = sanitizePath(url)
      } catch (error) {
        return new Response(String(error), { status: 403 })
      }

      const file = Bun.file(path)
      if (!(await file.exists())) {
        return new Response('Not found', { status: 404 })
      }

      if (path.endsWith('.ts')) {
        const source = await file.text()
        const js = transpiler.transformSync(source)
        return new Response(js, {
          headers: { 'content-type': contentTypeFor(path) },
        })
      }

      return new Response(file, {
        headers: { 'content-type': contentTypeFor(path) },
      })
    },
  })
}

export async function resolveLoopbackBaseUrl(port: number) {
  const candidates = ['127.0.0.1', 'localhost', '[::1]']
  for (const host of candidates) {
    const baseUrl = `http://${host}:${port}`
    try {
      const response = await fetch(`${baseUrl}/index.html`)
      if (response.ok) return baseUrl
    } catch {
      // Try the next loopback alias.
    }
  }
  throw new Error(`Unable to reach round server on port ${port}`)
}
