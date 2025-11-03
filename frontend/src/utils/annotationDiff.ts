import { AnnotationBox, AnnotationDiffSummary } from '../types/annotations';

const createKey = (box: AnnotationBox): string => [
  box.id,
  box.imageId,
  box.category?.toLowerCase(),
  box.value?.toLowerCase(),
  box.x,
  box.y,
  box.width,
  box.height,
].join(':');

export const computeDiff = (
  previous: AnnotationBox[],
  current: AnnotationBox[]
): AnnotationDiffSummary => {
  const previousMap = new Map(previous.map(box => [box.id, box]));
  const currentMap = new Map(current.map(box => [box.id, box]));

  let added = 0;
  let removed = 0;
  let updated = 0;
  let unchanged = 0;

  for (const [id, box] of currentMap.entries()) {
    if (!previousMap.has(id)) {
      added += 1;
      continue;
    }

    const previousBox = previousMap.get(id)!;
    if (createKey(previousBox) === createKey(box)) {
      unchanged += 1;
    } else {
      updated += 1;
    }
  }

  for (const id of previousMap.keys()) {
    if (!currentMap.has(id)) {
      removed += 1;
    }
  }

  return { added, removed, updated, unchanged };
};
