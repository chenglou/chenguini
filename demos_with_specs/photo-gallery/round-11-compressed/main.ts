import { createPhotoGalleryApp } from './photo-gallery-app'
import { runScenarioIfRequested } from './gallery-scenarios'

const root = document.getElementById('app')

if (root === null) {
  throw new Error('Missing #app root')
}

const app = createPhotoGalleryApp(root)

void runScenarioIfRequested(app)
