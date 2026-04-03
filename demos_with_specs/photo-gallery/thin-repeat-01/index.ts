import {mountPhotoGallery} from './app'
import {runScenarioIfNeeded} from './scenarioRunner'

const root = document.getElementById('app')
if (!(root instanceof HTMLDivElement)) {
  throw new Error('Missing #app root.')
}

const controller = mountPhotoGallery(root)
void runScenarioIfNeeded(controller)
