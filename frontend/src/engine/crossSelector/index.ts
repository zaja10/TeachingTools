import type { ParentCandidate, CrossCandidate, EconomicWeights } from './types';
import { Matrix } from 'ml-matrix';

/**
 * Predicts cross performance by averaging parent breeding values.
 * Generates all possible pairwise crosses (excluding selfs by default, or including them if desired).
 * Here we generate unique non-reciprocal crosses (i.e. P1 x P2 is the same as P2 x P1).
 */
export function predictCrosses(parents: ParentCandidate[]): CrossCandidate[] {
  const crosses: CrossCandidate[] = [];
  
  for (let i = 0; i < parents.length; i++) {
    for (let j = i + 1; j < parents.length; j++) {
      const p1 = parents[i];
      const p2 = parents[j];
      
      const cross: CrossCandidate = {
        p1: p1.gid,
        p2: p2.gid,
        crossName: `${p1.gid} x ${p2.gid}`,
        Heading: (p1.Heading + p2.Heading) / 2,
        Height: (p1.Height + p2.Height) / 2,
        TestWeight: (p1.TestWeight + p2.TestWeight) / 2,
        Yield: (p1.Yield + p2.Yield) / 2,
        DON: (p1.DON + p2.DON) / 2,
        FDK: (p1.FDK + p2.FDK) / 2,
      };
      
      crosses.push(cross);
    }
  }
  
  return crosses;
}

/**
 * Evaluates the predicted crosses using the linear Selection Merit Index approach.
 * Merit = sum(B_i * X_i)
 * Relative Profit = merit_cross - mu_merit
 * Ranking is assigned by sorting merit descending.
 */
export function evaluateCrosses(
  crosses: CrossCandidate[], 
  weights: EconomicWeights
): CrossCandidate[] {
  if (crosses.length === 0) return [];

  // Define the trait keys we are tracking
  const traits: (keyof EconomicWeights)[] = ['Heading', 'Height', 'TestWeight', 'Yield', 'DON', 'FDK'];
  
  // Create an N x M matrix of cross values, where N is crosses, M is traits
  // ml-matrix allows fast dot products
  const X_data = crosses.map(cross => traits.map(t => cross[t] as number));
  const X_matrix = new Matrix(X_data);
  
  // Create an M x 1 column vector of weights
  const B_data = traits.map(t => [weights[t]]);
  const B_matrix = new Matrix(B_data);
  
  // Matrix multiplication: X (N x M) * B (M x 1) = Merit (N x 1)
  const meritMatrix = X_matrix.mmul(B_matrix);
  
  // Extract merit scores
  const meritScores = meritMatrix.to1DArray();
  
  // Calculate population mean merit
  const sumMerit = meritScores.reduce((a, b) => a + b, 0);
  const mu_merit = sumMerit / meritScores.length;
  
  // Append calculated values back to the objects
  const evaluated = crosses.map((cross, idx) => ({
    ...cross,
    merit: meritScores[idx],
    relativeProfit: meritScores[idx] - mu_merit
  }));
  
  // Sort descending by merit to assign rankings
  evaluated.sort((a, b) => b.merit! - a.merit!);
  
  // Assign ranking (1 is best)
  evaluated.forEach((cross, idx) => {
    cross.ranking = idx + 1;
  });
  
  return evaluated;
}

export function runCrossSelector(
  parents: ParentCandidate[], 
  weights: EconomicWeights
): CrossCandidate[] {
  const predicted = predictCrosses(parents);
  return evaluateCrosses(predicted, weights);
}
