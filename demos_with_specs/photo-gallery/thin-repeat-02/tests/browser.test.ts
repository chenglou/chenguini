import {describe, expect, test} from 'bun:test';

import {photoGalleryData} from '../data';
import {runScenario, REPORT_TIMEOUT_MS} from './browserHarness';

describe('page-owned browser scenarios', () => {
  test(
    'hash sync opens the focused item from the hash and keeps the hash current after navigation',
    async () => {
      const initialId = photoGalleryData[9]!.id;
      const expectedNextId = photoGalleryData[10]!.id;

      const report = await runScenario({
        scenario: 'hash-sync',
        hash: `photo=${encodeURIComponent(initialId)}`,
      });

      expect(report.initialFocusedId).toBe(initialId);
      expect(report.updatedFocusedId).toBe(expectedNextId);
      expect(report.hash).toBe(`#photo=${encodeURIComponent(expectedNextId)}`);
      expect(report.mode).toBe('line');
    },
    REPORT_TIMEOUT_MS,
  );

  test(
    'caption click selects the full prompt and stays in grid mode',
    async () => {
      const report = await runScenario({scenario: 'caption-selection'});

      expect(report.selectedText).toBe(photoGalleryData[8]!.prompt);
      expect(report.mode).toBe('grid');
      expect(report.hash).toBe('');
    },
    REPORT_TIMEOUT_MS,
  );

  test(
    'dismiss restore lands the focused row with about 40px above it',
    async () => {
      const report = await runScenario({scenario: 'dismiss-restore'});

      expect(report.mode).toBe('grid');
      expect(report.hash).toBe('');
      expect(report.restoreGapPx).toBeGreaterThanOrEqual(36);
      expect(report.restoreGapPx).toBeLessThanOrEqual(44);
    },
    REPORT_TIMEOUT_MS,
  );

  test(
    'occlusion mounts fewer cards than the full data set',
    async () => {
      const report = await runScenario({scenario: 'occlusion'});

      expect(report.totalCardCount).toBe(photoGalleryData.length);
      expect(report.mountedCardCount).toBeLessThan(photoGalleryData.length);
      expect(report.mountedCardCount).toBeGreaterThan(0);
    },
    REPORT_TIMEOUT_MS,
  );

  test(
    'line click routing uses left strip previous, right strip next, middle dismiss',
    async () => {
      const report = await runScenario({scenario: 'line-click-routing'});

      expect(report.routeTrace).toEqual([
        `prev:${photoGalleryData[11]!.id}`,
        `next:${photoGalleryData[12]!.id}`,
        'dismiss:grid',
      ]);
      expect(report.mode).toBe('grid');
    },
    REPORT_TIMEOUT_MS,
  );
});
