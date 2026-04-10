import {runNicerHackerNewsStaticVerification} from './layout-static-verifier.ts'

const source = await Bun.file(new URL('./hn-thread-layout.ts', import.meta.url)).text()
const report = runNicerHackerNewsStaticVerification(source)

console.log(JSON.stringify(report, null, 2))
if (report.phase !== 'ready') process.exitCode = 1
