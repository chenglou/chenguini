import {runPhotoGalleryStaticVerificationForSourceFile} from './layout-static-verifier.ts'

const sourceFilePath = new URL('./layout-model.ts', import.meta.url).pathname
const report = await runPhotoGalleryStaticVerificationForSourceFile(sourceFilePath)

console.log(JSON.stringify(report, null, 2))
if (report.phase !== 'ready') process.exitCode = 1
