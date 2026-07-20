/** Pure variant logic for building archetypes. No canvas imports — this
 * module must stay testable without a DOM. */

/**
 * Stable per-tile decision stream derived from the renderer's variant
 * float; same variant → same stream. Same LCG family drawRubble uses.
 */
export function channels(variant: number): () => number {
  let h = 1 + Math.floor(variant * 976_000_405);
  return () => {
    h = (h * 1103515245 + 12345) % 2147483648;
    return h / 2147483648;
  };
}
