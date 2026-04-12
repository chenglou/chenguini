import {runScrollAnchorStaticVerification} from './static-verifier.ts'

const source = await Bun.file(new URL('../../demos/scroll-anchor/anchor-layout.ts', import.meta.url)).text()
const report = runScrollAnchorStaticVerification(source)

console.log(JSON.stringify(report, null, 2))
if (report.phase !== 'ready') process.exitCode = 1
