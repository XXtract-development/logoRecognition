/** Score kind per detection method (shared by /detect and the GS1 block). */
export const SCORE_KINDS: Record<string, string> = {
  embedding: 'embedding-cosine-similarity', classifier: 'classifier-softmax',
  'nutriscore-head': 'nutriscore-color-geometry-score', 'nutriscore-a2': 'classifier-softmax',
  'ghs-specialist': 'uncalibrated-classifier-score', 'ghs-reference': 'template-similarity-not-probability',
  'ghs-glyph': 'uncalibrated-classifier-score', 'ghs-template': 'template-similarity-not-probability',
};
