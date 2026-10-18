import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getIsOutdated } from './versions';

describe('AP fork version comparison', () => {
  beforeEach(() => {
    vi.stubGlobal('Actual', { ACTUAL_VERSION: '26.9.0-ap.1' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['v26.9.0', false],
    ['26.9.0-ap.1', false],
    ['v26.8.0', false],
    ['v26.10.0', true],
  ])('compares with %s', (latestVersion, isOutdated) => {
    expect(getIsOutdated(latestVersion)).toBe(isOutdated);
  });
});
