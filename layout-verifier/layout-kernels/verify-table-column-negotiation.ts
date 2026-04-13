import {runTableColumnNegotiationStaticVerification} from './table-column-negotiation-static-verifier.ts'

const source = await Bun.file(new URL('../../demos/layout-kernels/table-column-negotiation.ts', import.meta.url)).text()
const report = runTableColumnNegotiationStaticVerification(source)

console.log(JSON.stringify(report, null, 2))
if (report.phase !== 'ready') process.exitCode = 1
