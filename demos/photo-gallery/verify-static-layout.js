import {runPhotoGalleryStaticVerification} from './layout-static-verifier.ts'

const source = await Bun.file(new URL('./layout-model.ts', import.meta.url)).text()
const report = runPhotoGalleryStaticVerification(source)

console.log(JSON.stringify(report, null, 2))
if (report.phase !== 'ready') process.exitCode = 1
