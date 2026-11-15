import { describe, it, expect } from 'vitest';
import { CONTENT_REPORT_CATEGORIES, isContentReportCategory } from '../../../src/domain/contentReport/ContentReport';

describe('isContentReportCategory', () => {
  it('accepts every listed category', () => {
    expect(CONTENT_REPORT_CATEGORIES).toHaveLength(6);
    for (const c of CONTENT_REPORT_CATEGORIES) expect(isContentReportCategory(c)).toBe(true);
  });

  it('rejects anything else', () => {
    for (const v of ['weapons', '', undefined, null, 1, {}]) expect(isContentReportCategory(v)).toBe(false);
  });
});
