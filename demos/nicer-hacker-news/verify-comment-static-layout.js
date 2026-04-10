import {runHNCommentLayoutStaticVerificationForSourceFile} from './comment-layout-static-verifier.ts'

const sourceFilePath = new URL('./hn-comment-layout.ts', import.meta.url).pathname
const report = await runHNCommentLayoutStaticVerificationForSourceFile(sourceFilePath)

console.log(JSON.stringify(report, null, 2))
if (report.phase !== 'ready') process.exitCode = 1
