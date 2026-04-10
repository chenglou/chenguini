declare module 'node:fs' {
  export function existsSync(path: string): boolean
  export function readFileSync(path: string, encoding: string): string
}

declare module 'node:path' {
  const path: {
    dirname(path: string): string
    extname(path: string): string
    join(...parts: string[]): string
    resolve(...parts: string[]): string
  }
  export default path
}

declare module 'node:url' {
  export function pathToFileURL(path: string): {href: string}
}

declare const Bun: {
  file(path: string): {
    text(): Promise<string>
  }
}
