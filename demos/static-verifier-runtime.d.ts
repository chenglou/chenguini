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

declare module 'bun:test' {
  export function test(name: string, fn: () => void | Promise<void>, timeout?: number): void
  export const expect: {
    <T>(value: T): {
      toBe(expected: T): void
      toEqual(expected: unknown): void
      toBeDefined(): void
      toBeUndefined(): void
      toBeGreaterThan(expected: number): void
      toBeGreaterThanOrEqual(expected: number): void
      toContain(expected: string): void
      toHaveLength(expected: number): void
      toStartWith(expected: string): void
      not: {
        toBe(expected: T): void
      }
    }
  }
}

declare const Bun: {
  file(path: string | URL): {
    text(): Promise<string>
  }
}

declare const process: {
  exitCode?: number
}
