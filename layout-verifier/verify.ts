import {verifyLayoutFiles} from './check.ts'

const paths = Bun.argv.slice(2)

if (paths.length === 0) {
  console.error('Usage: bun layout-verifier/verify.ts <file.ts> ...')
  process.exitCode = 1
} else {
  const report = await verifyLayoutFiles(paths)
  console.log(JSON.stringify(report, null, 2))
  if (report.phase !== 'ready') process.exitCode = 1
}
