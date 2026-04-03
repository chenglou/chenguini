import {
  getGridImageSrc,
  getLineImageSrc,
  photoGalleryData,
  type PhotoData,
} from './data';
import {
  CAPTION_BOTTOM_PADDING,
  GRID_CAPTION_VISIBLE_HEIGHT,
  GRID_OVERSCAN,
  GRID_TOP_PADDING,
  LEFT_STRIP_WIDTH,
  LINE_BOTTOM_GAP,
  LINE_CAPTION_VISIBLE_HEIGHT,
  LINE_GAP,
  LINE_NEIGHBOR_SCALE,
  RIGHT_STRIP_WIDTH,
  clampIndex,
  computeGridLayout,
  getFocusedHash,
  parseFocusedIdFromHash,
  routeLineClick,
  type GridItemLayout,
  type GridLayout,
} from './layout';

type Mode = 'grid' | 'line';
type ScenarioName =
  | ''
  | 'hash-sync'
  | 'caption-selection'
  | 'dismiss-restore'
  | 'occlusion'
  | 'line-click-routing';

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error';
  requestId: string;
  scenario: ScenarioName;
  message?: string;
  mode?: Mode;
  focusedId?: string | null;
  initialFocusedId?: string | null;
  updatedFocusedId?: string | null;
  hash?: string;
  selectedText?: string;
  restoreGapPx?: number;
  mountedCardCount?: number;
  totalCardCount?: number;
  routeTrace?: string[];
};

type GridCardNode = {
  root: HTMLElement;
  mediaButton: HTMLButtonElement;
  image: HTMLImageElement;
  caption: HTMLParagraphElement;
};

function fitPhotoWithin(photo: PhotoData, maxWidth: number, maxHeight: number, scale = 1) {
  const aspect = photo.w / photo.h;
  let width = maxWidth;
  let height = width / aspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }
  return {width: width * scale, height: height * scale};
}

function selectNodeText(node: Node) {
  const selection = window.getSelection();
  if (selection == null) {
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

export class PhotoGalleryApp {
  private readonly root: HTMLElement;
  private readonly gridLayer: HTMLDivElement;
  private readonly lineOverlay: HTMLDivElement;
  private readonly reportNode: HTMLScriptElement;
  private readonly params = new URLSearchParams(location.search);
  private readonly cardCache = new Map<string, GridCardNode>();
  private readonly usePlaceholderImages: boolean;

  private focusedIndex: number | null = null;
  private renderQueued = false;
  private isWritingHash = false;
  private layout: GridLayout = computeGridLayout(photoGalleryData, this.viewportWidth);

  private readonly scenario = (this.params.get('scenario') ?? '') as ScenarioName;
  private readonly requestId = this.params.get('requestId') ?? '';

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.className = 'gallery-root';

    this.gridLayer = document.createElement('div');
    this.gridLayer.className = 'gallery-grid-layer';

    this.lineOverlay = document.createElement('div');
    this.lineOverlay.className = 'gallery-line-overlay';
    this.lineOverlay.dataset.role = 'line-overlay';
    this.lineOverlay.hidden = true;
    this.lineOverlay.addEventListener('click', this.handleLineOverlayClick);

    this.reportNode = document.getElementById('scenario-report') as HTMLScriptElement;
    this.usePlaceholderImages = this.scenario !== '';

    this.root.append(this.gridLayer, this.lineOverlay);

    window.addEventListener('scroll', this.handleWindowScroll, {passive: true});
    window.addEventListener('resize', this.handleWindowResize);
    window.addEventListener('hashchange', this.handleHashChange);

    const focusedIdFromHash = parseFocusedIdFromHash(location.hash);
    this.focusedIndex = focusedIdFromHash == null ? null : this.findPhotoIndex(focusedIdFromHash);
    if (this.focusedIndex !== null) {
      this.lockDocumentScroll();
    }

    if (this.scenario !== '' && this.requestId !== '') {
      this.publishReport({phase: 'loading'});
    }

    this.render();
    if (this.scenario !== '' && this.requestId !== '') {
      void this.runScenario();
    }
  }

  private get viewportWidth() {
    return document.documentElement.clientWidth;
  }

  private get viewportHeight() {
    return document.documentElement.clientHeight;
  }

  private get scrollTop() {
    return window.scrollY || document.documentElement.scrollTop;
  }

  private get mode(): Mode {
    return this.focusedIndex === null ? 'grid' : 'line';
  }

  private get focusedPhoto() {
    return this.focusedIndex === null ? null : photoGalleryData[this.focusedIndex] ?? null;
  }

  private findPhotoIndex(id: string) {
    const index = photoGalleryData.findIndex((photo) => photo.id === id);
    return index === -1 ? null : index;
  }

  private requestRender = () => {
    if (this.renderQueued) {
      return;
    }
    this.renderQueued = true;
    requestAnimationFrame(() => {
      this.renderQueued = false;
      this.render();
    });
  };

  private handleWindowScroll = () => {
    if (this.mode === 'grid') {
      this.requestRender();
    }
  };

  private handleWindowResize = () => {
    this.requestRender();
  };

  private handleHashChange = () => {
    if (this.isWritingHash) {
      return;
    }
    const focusedIdFromHash = parseFocusedIdFromHash(location.hash);
    if (focusedIdFromHash == null) {
      if (this.focusedIndex !== null) {
        this.dismissLineMode({syncHash: false});
      }
      return;
    }
    const nextIndex = this.findPhotoIndex(focusedIdFromHash);
    if (nextIndex !== null) {
      this.openLineMode(nextIndex, {syncHash: false});
    }
  };

  private handleLineOverlayClick = (event: MouseEvent) => {
    if (this.focusedIndex === null) {
      return;
    }
    switch (routeLineClick(event.clientX, this.viewportWidth)) {
      case 'previous':
        this.moveLineFocus(-1);
        break;
      case 'next':
        this.moveLineFocus(1);
        break;
      case 'dismiss':
        this.dismissLineMode();
        break;
    }
  };

  private render() {
    this.layout = computeGridLayout(photoGalleryData, this.viewportWidth);
    this.root.style.minHeight = `${Math.max(this.viewportHeight, this.layout.totalHeight)}px`;
    this.root.dataset.mode = this.mode;
    this.renderGridLayer();
    this.renderLineOverlay();
  }

  private renderGridLayer() {
    this.gridLayer.style.height = `${this.layout.totalHeight}px`;

    const minY = this.scrollTop - GRID_OVERSCAN;
    const maxY = this.scrollTop + this.viewportHeight + GRID_OVERSCAN;
    const visibleItems = this.layout.items.filter((item) => {
      return item.bottom >= minY && item.top <= maxY;
    });
    const visibleIds = new Set(visibleItems.map((item) => item.id));

    for (const [id, card] of this.cardCache) {
      if (!visibleIds.has(id)) {
        card.root.remove();
      }
    }

    for (const item of visibleItems) {
      let card = this.cardCache.get(item.id);
      if (card == null) {
        card = this.createGridCardNode(item.id);
        this.cardCache.set(item.id, card);
      }
      this.updateGridCardNode(card, item);
      this.gridLayer.append(card.root);
    }
  }

  private createGridCardNode(photoId: string): GridCardNode {
    const root = document.createElement('article');
    root.className = 'gallery-card';
    root.dataset.role = 'grid-card';
    root.dataset.photoId = photoId;

    const mediaButton = document.createElement('button');
    mediaButton.type = 'button';
    mediaButton.className = 'gallery-card__media';
    mediaButton.dataset.role = 'grid-media';
    mediaButton.addEventListener('click', () => {
      const index = Number(root.dataset.index);
      this.openLineMode(index);
    });

    const image = document.createElement('img');
    image.className = 'gallery-card__image';
    image.draggable = false;
    image.loading = 'lazy';
    mediaButton.append(image);

    const caption = document.createElement('p');
    caption.className = 'gallery-card__caption';
    caption.dataset.role = 'grid-caption';
    caption.dataset.photoId = photoId;
    caption.addEventListener('click', (event) => {
      event.stopPropagation();
      selectNodeText(caption);
    });

    root.append(mediaButton, caption);
    return {root, mediaButton, image, caption};
  }

  private updateGridCardNode(card: GridCardNode, item: GridItemLayout) {
    const photo = photoGalleryData[item.index]!;
    card.root.dataset.index = `${item.index}`;
    card.root.dataset.photoId = photo.id;
    card.root.style.left = `${item.left}px`;
    card.root.style.top = `${item.top}px`;
    card.root.style.width = `${item.width}px`;
    card.root.style.height = `${item.height}px`;

    card.mediaButton.style.height = `${item.mediaHeight}px`;
    card.image.alt = photo.prompt;
    const nextSrc = getGridImageSrc(photo, this.usePlaceholderImages);
    if (card.image.src !== nextSrc) {
      card.image.src = nextSrc;
    }
    card.caption.textContent = photo.prompt;
    card.caption.title = photo.prompt;
  }

  private renderLineOverlay() {
    const focusedPhoto = this.focusedPhoto;
    if (focusedPhoto == null || this.focusedIndex == null) {
      this.lineOverlay.hidden = true;
      this.lineOverlay.replaceChildren();
      return;
    }

    this.lineOverlay.hidden = false;
    const viewportWidth = this.viewportWidth;
    const viewportHeight = this.viewportHeight;
    const captionBandHeight =
      LINE_CAPTION_VISIBLE_HEIGHT + CAPTION_BOTTOM_PADDING + LINE_BOTTOM_GAP;
    const mediaAreaHeight = Math.max(240, viewportHeight - captionBandHeight - 88);
    const focusedBounds = fitPhotoWithin(
      focusedPhoto,
      Math.min(920, viewportWidth - LEFT_STRIP_WIDTH - RIGHT_STRIP_WIDTH - 120),
      mediaAreaHeight,
    );
    const focusedLeft = (viewportWidth - focusedBounds.width) / 2;
    const focusedTop = Math.max(36, (mediaAreaHeight - focusedBounds.height) / 2 + 26);

    const overlayChildren: HTMLElement[] = [];
    overlayChildren.push(this.createLineStrip('left', 'Prev'));
    overlayChildren.push(this.createLineStrip('right', 'Next'));

    const positions = new Map<number, {left: number; top: number; width: number; height: number}>();
    positions.set(this.focusedIndex, {
      left: focusedLeft,
      top: focusedTop,
      width: focusedBounds.width,
      height: focusedBounds.height,
    });

    let leftCursor = focusedLeft - LINE_GAP;
    for (let index = this.focusedIndex - 1; index >= Math.max(0, this.focusedIndex - 3); index -= 1) {
      const photo = photoGalleryData[index]!;
      const size = fitPhotoWithin(
        photo,
        focusedBounds.width,
        focusedBounds.height,
        LINE_NEIGHBOR_SCALE,
      );
      leftCursor -= size.width;
      positions.set(index, {
        left: leftCursor,
        top: focusedTop + (focusedBounds.height - size.height) / 2,
        width: size.width,
        height: size.height,
      });
      leftCursor -= LINE_GAP;
    }

    let rightCursor = focusedLeft + focusedBounds.width + LINE_GAP;
    for (
      let index = this.focusedIndex + 1;
      index <= Math.min(photoGalleryData.length - 1, this.focusedIndex + 3);
      index += 1
    ) {
      const photo = photoGalleryData[index]!;
      const size = fitPhotoWithin(
        photo,
        focusedBounds.width,
        focusedBounds.height,
        LINE_NEIGHBOR_SCALE,
      );
      positions.set(index, {
        left: rightCursor,
        top: focusedTop + (focusedBounds.height - size.height) / 2,
        width: size.width,
        height: size.height,
      });
      rightCursor += size.width + LINE_GAP;
    }

    for (const [index, position] of positions) {
      const photo = photoGalleryData[index]!;
      overlayChildren.push(
        this.createLineCard(photo, position, {
          focused: index === this.focusedIndex,
          offset: index - this.focusedIndex,
        }),
      );
    }

    const caption = document.createElement('div');
    caption.className = 'gallery-line-caption';
    caption.textContent = focusedPhoto.prompt;
    caption.style.top = `${focusedTop + focusedBounds.height + LINE_BOTTOM_GAP}px`;
    overlayChildren.push(caption);

    const hint = document.createElement('div');
    hint.className = 'gallery-line-hint';
    hint.textContent = 'Click the middle band to return to the grid';
    overlayChildren.push(hint);

    this.lineOverlay.replaceChildren(...overlayChildren);
  }

  private createLineStrip(side: 'left' | 'right', label: string) {
    const strip = document.createElement('div');
    strip.className = `gallery-line-strip gallery-line-strip--${side}`;
    strip.textContent = label;
    return strip;
  }

  private createLineCard(
    photo: PhotoData,
    position: {left: number; top: number; width: number; height: number},
    options: {focused: boolean; offset: number},
  ) {
    const card = document.createElement('article');
    card.className = 'gallery-line-card';
    if (options.focused) {
      card.classList.add('gallery-line-card--focused');
    }
    card.style.left = `${position.left}px`;
    card.style.top = `${position.top}px`;
    card.style.width = `${position.width}px`;
    card.style.height = `${position.height}px`;

    const image = document.createElement('img');
    image.className = 'gallery-line-card__image';
    image.alt = photo.prompt;
    image.draggable = false;
    image.src = getLineImageSrc(photo, this.usePlaceholderImages);
    card.append(image);

    if (!options.focused) {
      card.style.opacity = `${Math.max(0.25, 0.85 - Math.abs(options.offset) * 0.2)}`;
    }

    return card;
  }

  private lockDocumentScroll() {
    document.documentElement.classList.add('gallery-line-open');
  }

  private unlockDocumentScroll() {
    document.documentElement.classList.remove('gallery-line-open');
  }

  private writeFocusedHash(focusedIndex: number | null) {
    const url = new URL(location.href);
    const nextHash = focusedIndex === null ? '' : getFocusedHash(photoGalleryData[focusedIndex]!.id);
    if (url.hash === nextHash) {
      return;
    }
    this.isWritingHash = true;
    if (focusedIndex === null) {
      url.hash = '';
      history.pushState(null, '', url);
      requestAnimationFrame(() => {
        this.isWritingHash = false;
      });
      return;
    }
    location.hash = nextHash;
    requestAnimationFrame(() => {
      this.isWritingHash = false;
    });
  }

  private openLineMode(index: number, options: {syncHash?: boolean} = {}) {
    const nextIndex = clampIndex(index, photoGalleryData.length);
    this.focusedIndex = nextIndex;
    this.lockDocumentScroll();
    if (options.syncHash !== false) {
      this.writeFocusedHash(nextIndex);
    }
    this.requestRender();
  }

  private moveLineFocus(delta: number) {
    if (this.focusedIndex == null) {
      return;
    }
    const nextIndex = clampIndex(this.focusedIndex + delta, photoGalleryData.length);
    if (nextIndex === this.focusedIndex) {
      return;
    }
    this.focusedIndex = nextIndex;
    this.writeFocusedHash(nextIndex);
    this.requestRender();
  }

  private dismissLineMode(options: {syncHash?: boolean} = {}) {
    if (this.focusedIndex == null) {
      return;
    }
    const previousIndex = this.focusedIndex;
    this.focusedIndex = null;
    this.unlockDocumentScroll();
    if (options.syncHash !== false) {
      this.writeFocusedHash(null);
    }
    this.requestRender();
    requestAnimationFrame(() => {
      this.layout = computeGridLayout(photoGalleryData, this.viewportWidth);
      const rowTop = this.layout.items[previousIndex]!.top;
      window.scrollTo(0, Math.max(0, rowTop - GRID_TOP_PADDING));
      requestAnimationFrame(() => {
        this.requestRender();
      });
    });
  }

  private publishReport(report: Omit<Report, 'requestId' | 'scenario'>) {
    const fullReport: Report = {
      requestId: this.requestId,
      scenario: this.scenario,
      ...report,
    };
    this.reportNode.textContent = JSON.stringify(fullReport);
  }

  private async waitFor(check: () => boolean, timeoutMs = 4_000) {
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      if (check()) {
        return;
      }
      await this.afterNextPaint();
    }
    throw new Error(`Timed out waiting for ${this.scenario}.`);
  }

  private async afterNextPaint(frameCount = 1) {
    for (let frame = 0; frame < frameCount; frame += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    }
  }

  private findGridCaption(photoId: string) {
    return this.gridLayer.querySelector<HTMLParagraphElement>(
      `[data-role="grid-caption"][data-photo-id="${CSS.escape(photoId)}"]`,
    );
  }

  private findGridMediaButton(photoId: string) {
    return this.gridLayer.querySelector<HTMLButtonElement>(
      `.gallery-card[data-photo-id="${CSS.escape(photoId)}"] [data-role="grid-media"]`,
    );
  }

  private async scrollGridToItem(index: number, offset = 120) {
    const targetTop = Math.max(0, this.layout.items[index]!.top - offset);
    window.scrollTo(0, targetTop);
    await this.afterNextPaint(3);
  }

  private clickLineAt(x: number, y: number) {
    this.lineOverlay.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      }),
    );
  }

  private async runScenario() {
    this.publishReport({phase: 'running'});

    try {
      await this.afterNextPaint(3);
      switch (this.scenario) {
        case 'hash-sync':
          await this.runHashSyncScenario();
          break;
        case 'caption-selection':
          await this.runCaptionSelectionScenario();
          break;
        case 'dismiss-restore':
          await this.runDismissRestoreScenario();
          break;
        case 'occlusion':
          await this.runOcclusionScenario();
          break;
        case 'line-click-routing':
          await this.runLineClickRoutingScenario();
          break;
        case '':
          break;
      }
    } catch (error) {
      this.publishReport({
        phase: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async runHashSyncScenario() {
    await this.waitFor(() => this.mode === 'line' && this.focusedPhoto != null);
    const initialFocusedId = this.focusedPhoto?.id ?? null;
    this.clickLineAt(this.viewportWidth - RIGHT_STRIP_WIDTH / 2, this.viewportHeight / 2);
    await this.waitFor(() => this.focusedPhoto?.id !== initialFocusedId);
    this.publishReport({
      phase: 'ready',
      mode: this.mode,
      initialFocusedId,
      updatedFocusedId: this.focusedPhoto?.id ?? null,
      hash: location.hash,
    });
  }

  private async runCaptionSelectionScenario() {
    const targetPhoto = photoGalleryData[8]!;
    await this.scrollGridToItem(8, 0);
    const caption = this.findGridCaption(targetPhoto.id);
    if (caption == null) {
      throw new Error('Caption selection scenario could not find the target caption.');
    }
    caption.click();
    await this.afterNextPaint(2);
    this.publishReport({
      phase: 'ready',
      mode: this.mode,
      hash: location.hash,
      selectedText: window.getSelection()?.toString() ?? '',
    });
  }

  private async runDismissRestoreScenario() {
    const targetIndex = 16;
    const targetPhoto = photoGalleryData[targetIndex]!;
    await this.scrollGridToItem(targetIndex, 160);
    const mediaButton = this.findGridMediaButton(targetPhoto.id);
    if (mediaButton == null) {
      throw new Error('Dismiss restore scenario could not find the target image area.');
    }
    mediaButton.click();
    await this.waitFor(() => this.mode === 'line');
    this.clickLineAt(this.viewportWidth / 2, this.viewportHeight / 2);
    await this.waitFor(() => this.mode === 'grid');
    await this.afterNextPaint(3);
    const card = this.gridLayer.querySelector<HTMLElement>(
      `.gallery-card[data-photo-id="${CSS.escape(targetPhoto.id)}"]`,
    );
    if (card == null) {
      throw new Error('Dismiss restore scenario lost the focused row card.');
    }
    this.publishReport({
      phase: 'ready',
      mode: this.mode,
      hash: location.hash,
      restoreGapPx: Math.round(card.getBoundingClientRect().top),
    });
  }

  private async runOcclusionScenario() {
    await this.scrollGridToItem(17, 160);
    const mountedCardCount = this.gridLayer.querySelectorAll('[data-role="grid-card"]').length;
    this.publishReport({
      phase: 'ready',
      mode: this.mode,
      mountedCardCount,
      totalCardCount: photoGalleryData.length,
    });
  }

  private async runLineClickRoutingScenario() {
    const targetIndex = 12;
    const targetPhoto = photoGalleryData[targetIndex]!;
    await this.scrollGridToItem(targetIndex, 160);
    const mediaButton = this.findGridMediaButton(targetPhoto.id);
    if (mediaButton == null) {
      throw new Error('Line click routing scenario could not find the target image area.');
    }
    mediaButton.click();
    await this.waitFor(() => this.mode === 'line');

    const trace: string[] = [];
    this.clickLineAt(LEFT_STRIP_WIDTH / 2, this.viewportHeight / 2);
    await this.waitFor(() => this.focusedPhoto?.id === photoGalleryData[targetIndex - 1]!.id);
    trace.push(`prev:${this.focusedPhoto?.id}`);

    this.clickLineAt(this.viewportWidth - RIGHT_STRIP_WIDTH / 2, this.viewportHeight / 2);
    await this.waitFor(() => this.focusedPhoto?.id === targetPhoto.id);
    trace.push(`next:${this.focusedPhoto?.id}`);

    this.clickLineAt(this.viewportWidth / 2, this.viewportHeight / 2);
    await this.waitFor(() => this.mode === 'grid');
    trace.push('dismiss:grid');

    this.publishReport({
      phase: 'ready',
      mode: this.mode,
      routeTrace: trace,
    });
  }
}
