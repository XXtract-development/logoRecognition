/**
 * Story 12.19 — fetchReviewItemSourceBlob parses the X-Context-Window header into
 * the [left,top,rw,rh,W,H] mapping (or null = whole artwork) so the deck can
 * convert a box drawn on the context fragment back to full-artwork fractions.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const getMock = vi.fn();
vi.mock('@/services/apiClient', () => ({
  default: { get: (...args: unknown[]) => getMock(...args) },
}));

import { fetchReviewItemSourceBlob } from './artworkReviewService';

beforeEach(() => {
  getMock.mockReset();
  (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:fake';
});

describe('fetchReviewItemSourceBlob', () => {
  it('parseert X-Context-Window naar een 6-getallen venster', async () => {
    getMock.mockResolvedValueOnce({
      data: new Blob(['x']),
      headers: { 'x-context-window': '100,50,400,300,1000,800' },
    });
    const res = await fetchReviewItemSourceBlob('ri-1');
    expect(res).toEqual({ url: 'blob:fake', window: [100, 50, 400, 300, 1000, 800] });
  });

  it('window = null wanneer de header ontbreekt (hele artwork, identiteitsmapping)', async () => {
    getMock.mockResolvedValueOnce({ data: new Blob(['x']), headers: {} });
    const res = await fetchReviewItemSourceBlob('ri-1');
    expect(res).toEqual({ url: 'blob:fake', window: null });
  });

  it('window = null bij een misvormde header (niet 6 getallen)', async () => {
    getMock.mockResolvedValueOnce({
      data: new Blob(['x']),
      headers: { 'x-context-window': '1,2,3' },
    });
    const res = await fetchReviewItemSourceBlob('ri-1');
    expect(res?.window).toBeNull();
  });

  it('geeft null terug bij een fout', async () => {
    getMock.mockRejectedValueOnce(new Error('boom'));
    expect(await fetchReviewItemSourceBlob('ri-1')).toBeNull();
  });
});
