import {runHNCommentLayoutStaticVerification} from './comment-layout-static-verifier.ts'

const source = await Bun.file(new URL('./hn-comment-layout.ts', import.meta.url)).text()
const report = runHNCommentLayoutStaticVerification(source)

console.log(JSON.stringify(report, null, 2))
if (report.phase !== 'ready') process.exitCode = 1
