import {runGeneratedListStaticVerification} from './generated-list-static-verifier.ts'

const source = await Bun.file(new URL('../../demos/layout-kernels/generated-list-geometry.ts', import.meta.url)).text()
const report = runGeneratedListStaticVerification(source)

console.log(JSON.stringify(report, null, 2))
if (report.phase !== 'ready') process.exitCode = 1
