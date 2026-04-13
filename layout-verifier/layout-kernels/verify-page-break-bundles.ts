import {runPageBreakStaticVerification} from './page-break-static-verifier.ts'

const source = await Bun.file(new URL('../../demos/layout-kernels/page-break-bundles.ts', import.meta.url)).text()
const report = runPageBreakStaticVerification(source)

console.log(JSON.stringify(report, null, 2))
if (report.phase !== 'ready') process.exitCode = 1
