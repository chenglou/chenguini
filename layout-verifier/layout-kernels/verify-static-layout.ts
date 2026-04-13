import {runGeneratedListStaticVerification} from './generated-list-static-verifier.ts'
import {runPageBreakStaticVerification} from './page-break-static-verifier.ts'
import {runTableColumnNegotiationStaticVerification} from './table-column-negotiation-static-verifier.ts'

const generatedListSource = await Bun.file(new URL('../../demos/layout-kernels/generated-list-geometry.ts', import.meta.url)).text()
const pageBreakSource = await Bun.file(new URL('../../demos/layout-kernels/page-break-bundles.ts', import.meta.url)).text()
const tableSource = await Bun.file(new URL('../../demos/layout-kernels/table-column-negotiation.ts', import.meta.url)).text()

const reports = [
  runGeneratedListStaticVerification(generatedListSource),
  runPageBreakStaticVerification(pageBreakSource),
  runTableColumnNegotiationStaticVerification(tableSource),
]

console.log(JSON.stringify(reports, null, 2))
if (reports.some(report => report.phase !== 'ready')) process.exitCode = 1
