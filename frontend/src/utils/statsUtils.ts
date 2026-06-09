import { jStat } from 'jstat';

export interface SummaryStats {
  min: number;
  q1: number;
  median: number;
  mean: number;
  q3: number;
  max: number;
  sd: number;
  nas: number;
}

export const calculateSummaryStats = (data: (number | null | undefined)[]): SummaryStats | null => {
  const validData = data.filter(d => d != null && !isNaN(d)) as number[];
  if (validData.length === 0) return null;

  return {
    min: jStat.min(validData),
    q1: jStat.percentile(validData, 0.25),
    median: jStat.median(validData),
    mean: jStat.mean(validData),
    q3: jStat.percentile(validData, 0.75),
    max: jStat.max(validData),
    sd: jStat.stdev(validData, true), // true for sample standard deviation
    nas: data.length - validData.length
  };
};

// Simplified ANOVA test comparing means across multiple groups
export const performAnova = (groups: number[][]) => {
  return jStat.anovaftest(...groups);
};

// Simplified T-Test (Two-sample, assuming unequal variances - Welch's t-test approximation)
export const performTTest = (group1: number[], group2: number[]) => {
  return jStat.ttest(group1, group2, 2); // 2 tails
};

// Linear model fitting y ~ x
export const fitLinearModel = (x: number[], y: number[]) => {
  // Filter out any pair where x or y is invalid
  const validPairs = x.map((xv, i) => [xv, y[i]]).filter(pair => 
    pair[0] != null && !isNaN(pair[0]) && pair[1] != null && !isNaN(pair[1])
  );
  
  if (validPairs.length < 2) return null;
  
  const xValid = validPairs.map(p => p[0]);
  const yValid = validPairs.map(p => p[1]);
  
  // Calculate slope and intercept (ordinary least squares)
  const n = xValid.length;
  const sumX = jStat.sum(xValid);
  const sumY = jStat.sum(yValid);
  const sumXY = jStat.sum(xValid.map((xv, i) => xv * yValid[i]));
  const sumX2 = jStat.sum(xValid.map(xv => xv * xv));
  
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  
  // R-squared
  const rsq = Math.pow(jStat.corrcoeff(xValid, yValid), 2);
  
  return { slope, intercept, rsq, n };
};

// Pearson correlation coefficient
export const calculateCorrelation = (x: number[], y: number[]) => {
  const validPairs = x.map((xv, i) => [xv, y[i]]).filter(pair => 
    pair[0] != null && !isNaN(pair[0]) && pair[1] != null && !isNaN(pair[1])
  );
  if (validPairs.length < 2) return null;
  return jStat.corrcoeff(validPairs.map(p => p[0]), validPairs.map(p => p[1]));
};
