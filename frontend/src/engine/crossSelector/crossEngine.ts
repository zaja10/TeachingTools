export interface PredictedCross {
  parent1: string;
  parent2: string;
  merit: number;
  relativeProfit: number;
  traitValues: Record<string, number>;
}

export function generateAndRankCrosses(
  fullData: Record<string, number[]>,
  selectedTraits: string[],
  optimalB: number[],
  lineNames: string[]
): PredictedCross[] {
  const nLines = lineNames.length;
  const crosses: PredictedCross[] = [];
  
  if (nLines < 2 || selectedTraits.length === 0 || !optimalB) return [];

  // 1. Calculate the mid-parent or predicted progeny value for every trait
  for (let i = 0; i < nLines; i++) {
    for (let j = i + 1; j < nLines; j++) {
      const p1Name = lineNames[i];
      const p2Name = lineNames[j];
      
      let crossMerit = 0;
      const traitValues: Record<string, number> = {};

      selectedTraits.forEach((trait, traitIdx) => {
        const valP1 = fullData[trait]?.[i] || 0;
        const valP2 = fullData[trait]?.[j] || 0;
        const predictedCrossVal = (valP1 + valP2) / 2;
        
        traitValues[trait] = predictedCrossVal;
        
        // Accumulate selection index merit using the active weights (b)
        crossMerit += predictedCrossVal * (optimalB[traitIdx] || 0);
      });

      crosses.push({
        parent1: p1Name,
        parent2: p2Name,
        merit: crossMerit,
        relativeProfit: 0, 
        traitValues
      });
    }
  }

  // 2. Compute Mean Merit to establish the 'relativeProfit' baseline
  const totalMeritSum = crosses.reduce((sum, c) => sum + c.merit, 0);
  const meanMerit = totalMeritSum / crosses.length;

  // 3. Assign relativeProfit and sort descending by merit
  crosses.forEach(c => {
    c.relativeProfit = c.merit - meanMerit;
  });

  return crosses.sort((a, b) => b.merit - a.merit);
}
