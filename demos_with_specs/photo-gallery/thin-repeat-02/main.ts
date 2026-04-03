import {PhotoGalleryApp} from './app';

const root = document.getElementById('app');

if (root == null) {
  throw new Error('Missing #app root.');
}

new PhotoGalleryApp(root);
