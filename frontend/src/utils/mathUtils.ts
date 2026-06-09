import { Matrix, SingularValueDecomposition } from 'ml-matrix';

export const applyTransform = (data: any[], transformType: string): number[] => {
  return data.map(val => {
    if (val === null || val === undefined || val === '') return NaN;
    const num = Number(val);
    if (isNaN(num)) return NaN;
    switch (transformType) {
      case "Log (log1p)":
        return Math.log1p(num);
      case "Sqrt":
        return num < 0 ? NaN : Math.sqrt(num);
      case "None":
      default:
        return num;
    }
  });
};

/**
 * Calculates Principal Component Analysis (PCA) using SVD.
 * @param data Array of arrays representing the matrix.
 * @param scale Whether to standard scale the data before PCA.
 * @param ncp Number of principal components to return.
 */
export const calculatePCA = (data: number[][], scale: boolean = true, ncp: number = 2) => {
  let matrix = new Matrix(data);
  
  // Center (and optionally scale) the data
  const colMeans = [];
  const colStds = [];
  
  for (let j = 0; j < matrix.columns; j++) {
    const col = matrix.getColumn(j);
    const mean = col.reduce((a, b) => a + b, 0) / col.length;
    colMeans.push(mean);
    
    let std = 1;
    if (scale) {
      const variance = col.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (col.length - 1);
      std = Math.sqrt(variance);
    }
    colStds.push(std);
    
    for (let i = 0; i < matrix.rows; i++) {
      matrix.set(i, j, (matrix.get(i, j) - mean) / (std === 0 ? 1 : std));
    }
  }

  // Calculate SVD
  const svd = new SingularValueDecomposition(matrix, { computeLeftSingularVectors: true, computeRightSingularVectors: true });
  
  // U * S gives the principal component scores (projected data)
  const U = svd.leftSingularVectors;
  const S = svd.diagonalMatrix;
  const scores = U.mmul(S);
  
  // Extract the first 'ncp' components
  const pcaScores = [];
  for (let i = 0; i < scores.rows; i++) {
    const row = [];
    for (let j = 0; j < Math.min(ncp, scores.columns); j++) {
      row.push(scores.get(i, j));
    }
    pcaScores.push(row);
  }

  // Calculate variance explained
  const eigenvalues = svd.diagonal.map(v => v * v / (matrix.rows - 1));
  const totalVar = eigenvalues.reduce((a, b) => a + b, 0);
  const varianceExplained = eigenvalues.map(v => (v / totalVar) * 100);

  return {
    scores: pcaScores,
    varianceExplained: varianceExplained.slice(0, ncp),
    eigenvalues: eigenvalues.slice(0, ncp)
  };
};
