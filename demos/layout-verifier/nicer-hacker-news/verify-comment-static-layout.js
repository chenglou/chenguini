import {runHNCommentLayoutStaticVerificationForSourceFile} from './comment-static-verifier.ts'

const sourceFilePath = new URL('../../nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
const report = await runHNCommentLayoutStaticVerificationForSourceFile(sourceFilePath)

console.log(JSON.stringify(report, null, 2))
if (report.phase !== 'ready') process.exitCode = 1
