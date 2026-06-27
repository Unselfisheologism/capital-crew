export function randomFloat(min: number, max: number): number {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return 0;
  }
  if (max <= min) {
    return min;
  }
  return min + Math.random() * (max - min);
}
