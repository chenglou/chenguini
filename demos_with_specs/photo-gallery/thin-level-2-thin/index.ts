import { createPhotoGalleryApp } from './app'
import { photoGalleryData } from './data'
import { runRequestedScenario } from './scenarioRunner'

const root = document.querySelector<HTMLElement>('#app')

if (root === null) {
  throw new Error('Missing #app root')
}

const reportMode = new URLSearchParams(window.location.search).has('scenario')
const app = createPhotoGalleryApp(root, photoGalleryData, {reportMode})
runRequestedScenario(app)
