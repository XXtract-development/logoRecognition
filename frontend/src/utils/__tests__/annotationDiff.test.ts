import { computeDiff } from '../annotationDiff';
import { AnnotationBox } from '../../types/annotations';

const buildBox = (overrides: Partial<AnnotationBox> = {}): AnnotationBox => ({
  id: overrides.id ?? 'bbox-1',
  imageId: overrides.imageId ?? 'image-1',
  x: overrides.x ?? 10,
  y: overrides.y ?? 20,
  width: overrides.width ?? 100,
  height: overrides.height ?? 120,
  category: overrides.category ?? 'Brand',
  value: overrides.value ?? 'Nike',
  tags: overrides.tags ?? [],
  metadata: overrides.metadata ?? {},
});

describe('computeDiff', () => {
  it('detects added annotations', () => {
    const previous: AnnotationBox[] = [];
    const current: AnnotationBox[] = [buildBox({ id: 'bbox-1' })];

    const diff = computeDiff(previous, current);

    expect(diff.added).toBe(1);
    expect(diff.updated).toBe(0);
    expect(diff.removed).toBe(0);
  });

  it('detects updated annotations', () => {
    const previous: AnnotationBox[] = [buildBox({ id: 'bbox-1', x: 10 })];
    const current: AnnotationBox[] = [buildBox({ id: 'bbox-1', x: 20 })];

    const diff = computeDiff(previous, current);

    expect(diff.added).toBe(0);
    expect(diff.updated).toBe(1);
    expect(diff.removed).toBe(0);
  });

  it('detects removed annotations', () => {
    const previous: AnnotationBox[] = [buildBox({ id: 'bbox-1' })];
    const current: AnnotationBox[] = [];

    const diff = computeDiff(previous, current);

    expect(diff.removed).toBe(1);
    expect(diff.added).toBe(0);
  });
});

