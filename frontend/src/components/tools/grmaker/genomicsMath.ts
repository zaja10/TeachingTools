import { Matrix, inverse } from 'ml-matrix';

export interface QCParams {
  markerCallRate: number;
  indCallRate: number;
  maf: number;
  heterozygosity: number;
  fis: number;
  imputeQC: boolean;
}

export const calculateGRM = (
  snpMatrix: number[][],
  method: 'VanRaden' | 'Yang',
  tuneType: 'None' | 'Bend' | 'Blend'
) => {
  const M = new Matrix(snpMatrix);
  const n = M.rows;
  const m = M.columns;

  // Impute NAs with column means (naive mean imputation for marker)
  const colMeans = [];
  const p = []; // allele frequencies
  
  for (let j = 0; j < m; j++) {
    const col = M.getColumn(j);
    const valid = col.filter(v => v != null && !isNaN(v));
    const mean = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
    colMeans.push(mean);
    p.push(mean / 2);
    
    for (let i = 0; i < n; i++) {
      if (M.get(i, j) == null || isNaN(M.get(i, j))) {
        M.set(i, j, mean);
      }
    }
  }

  let G: Matrix;

  if (method === 'VanRaden') {
    // W = M - P (where P is matrix of 2p)
    const W = new Matrix(n, m);
    let sum2pq = 0;
    for (let j = 0; j < m; j++) {
      const p_j = p[j];
      sum2pq += 2 * p_j * (1 - p_j);
      for (let i = 0; i < n; i++) {
        W.set(i, j, M.get(i, j) - 2 * p_j);
      }
    }
    // G = (W * W') / sum(2p(1-p))
    G = W.mmul(W.transpose()).mul(1 / sum2pq);
  } else {
    // Simplified Yang approximation for demonstration
    // Usually involves diagonal adjustments, but basic WW' scaling varies.
    // G = W * W' / N_markers
    const W = new Matrix(n, m);
    for (let j = 0; j < m; j++) {
      const p_j = p[j];
      const denom = Math.sqrt(2 * p_j * (1 - p_j));
      for (let i = 0; i < n; i++) {
        const val = denom > 0 ? (M.get(i, j) - 2 * p_j) / denom : 0;
        W.set(i, j, val);
      }
    }
    G = W.mmul(W.transpose()).mul(1 / m);
  }

  // Tuning (Blend/Bend)
  if (tuneType === 'Blend') {
    // Simple blend with identity to make positive definite: G* = 0.95G + 0.05I
    const I = Matrix.eye(n, n);
    G = G.mul(0.95).add(I.mul(0.05));
  } else if (tuneType === 'Bend') {
    // Simple bend: add small constant to diagonals
    for (let i = 0; i < n; i++) {
      G.set(i, i, G.get(i, i) + 0.01);
    }
  }

  // Inverse GRM
  let Ginv;
  try {
    Ginv = inverse(G);
  } catch (e) {
    console.error("Matrix could not be inverted exactly. Using pseudo-inverse or returning original.", e);
    // Return original if inversion completely fails
    Ginv = G;
  }

  return {
    grm: G.to2DArray(),
    grmInv: Ginv.to2DArray()
  };
};
