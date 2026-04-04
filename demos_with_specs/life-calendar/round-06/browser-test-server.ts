const cliPort = Number.parseInt(process.argv[2] ?? '0', 10)
const root = new URL('./', import.meta.url)
const transpiler = new Bun.Transpiler({ loader: 'ts' })

function contentType(pathname: string) {
  if (pathname.endsWith('.html')) return 'text/html; charset=utf-8'
  if (pathname.endsWith('.css')) return 'text/css; charset=utf-8'
  if (pathname.endsWith('.ts')) return 'application/javascript; charset=utf-8'
  if (pathname.endsWith('.js')) return 'application/javascript; charset=utf-8'
  if (pathname.endsWith('.json')) return 'application/json; charset=utf-8'
  return 'text/plain; charset=utf-8'
}

const server = Bun.serve({
  port: cliPort,
  async fetch(request) {
    const url = new URL(request.url)
    const pathname = url.pathname === '/' ? '/index.html' : url.pathname
    const fileUrl = new URL(`.${pathname}`, root)
    const file = Bun.file(fileUrl)
    if (!(await file.exists())) {
      return new Response('Not found', { status: 404 })
    }

    if (pathname.endsWith('.ts')) {
      const source = await file.text()
      return new Response(transpiler.transformSync(source), {
        headers: { 'content-type': contentType(pathname) },
      })
    }

    return new Response(file, {
      headers: { 'content-type': contentType(pathname) },
    })
  },
})

console.log(`READY ${server.port}`)

function shutdown() {
  server.stop(true)
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
