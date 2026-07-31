export interface SizeChartEntry {
  size: string;
  minChest: number;
  maxChest: number;
  minShoulder: number;
  maxShoulder: number;
}

export const sizeChart: SizeChartEntry[] = [
  { size: 'S', minChest: 36, maxChest: 38, minShoulder: 16.0, maxShoulder: 16.9 },
  { size: 'M', minChest: 38, maxChest: 40, minShoulder: 17.0, maxShoulder: 17.9 },
  { size: 'L', minChest: 40, maxChest: 42, minShoulder: 18.0, maxShoulder: 18.9 },
  { size: 'XL', minChest: 42, maxChest: 44, minShoulder: 19.0, maxShoulder: 19.9 },
  { size: '2XL', minChest: 44, maxChest: 46, minShoulder: 20.0, maxShoulder: 20.9 },
  { size: '3XL', minChest: 46, maxChest: 48, minShoulder: 21.0, maxShoulder: 22.0 }
];

export function determineSize(shoulderInches: number, chestInches: number, lengthInches: number = 0): string {
  if (shoulderInches <= 0 || chestInches <= 0) return '-';

  // Try to find a size that fits both chest and shoulder perfectly
  for (const entry of sizeChart) {
    if (
      chestInches >= entry.minChest && chestInches <= entry.maxChest &&
      shoulderInches >= entry.minShoulder && shoulderInches <= entry.maxShoulder
    ) {
      return entry.size;
    }
  }

  // If no perfect match, prioritize Chest as it's the most critical for t-shirts
  for (const entry of sizeChart) {
    if (chestInches >= entry.minChest && chestInches <= entry.maxChest) {
      return entry.size;
    }
  }

  // If chest still doesn't match perfectly, find the closest chest size
  let closestSize = sizeChart[0].size;
  let minDiff = Infinity;

  for (const entry of sizeChart) {
    const avgChest = (entry.minChest + entry.maxChest) / 2;
    const diff = Math.abs(chestInches - avgChest);
    if (diff < minDiff) {
      minDiff = diff;
      closestSize = entry.size;
    }
  }

  // If measurements are way off the top of the chart, append a '+'
  if (chestInches > sizeChart[sizeChart.length - 1].maxChest + 1 || shoulderInches > sizeChart[sizeChart.length - 1].maxShoulder + 1) {
    return closestSize + '+';
  }

  return closestSize;
}
