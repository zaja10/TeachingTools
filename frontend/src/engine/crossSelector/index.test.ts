import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { evaluateCrosses, predictCrosses } from './index';
import type { CrossCandidate, ParentCandidate, EconomicWeights } from './types';

describe('crossSelector Engine Parity Tests', () => {

  it('Calculates correct predicted cross performances (Xi) from parents', () => {
    const parents: ParentCandidate[] = [
      { gid: 'P1', Heading: 100, Height: 40, TestWeight: 60, Yield: 80, DON: 1.0, FDK: 10 },
      { gid: 'P2', Heading: 110, Height: 30, TestWeight: 58, Yield: 90, DON: 2.0, FDK: 20 }
    ];

    const crosses = predictCrosses(parents);
    expect(crosses.length).toBe(1);
    const c1 = crosses[0];

    expect(c1.Heading).toBe(105);
    expect(c1.Height).toBe(35);
    expect(c1.TestWeight).toBe(59);
    expect(c1.Yield).toBe(85);
    expect(c1.DON).toBe(1.5);
    expect(c1.FDK).toBe(15);
  });

  it('Calculates correct Merit, Ranking, and Relative Profit using ml-matrix', () => {
    const crosses: CrossCandidate[] = [
      { p1: 'A', p2: 'B', crossName: 'A x B', Heading: 10, Height: 10, TestWeight: 10, Yield: 10, DON: 10, FDK: 10 },
      { p1: 'C', p2: 'D', crossName: 'C x D', Heading: 20, Height: 20, TestWeight: 20, Yield: 20, DON: 20, FDK: 20 },
      { p1: 'E', p2: 'F', crossName: 'E x F', Heading: 30, Height: 30, TestWeight: 30, Yield: 30, DON: 30, FDK: 30 },
    ];

    // weights sum to 10
    const weights: EconomicWeights = {
      Heading: 1, Height: 1, TestWeight: 1, Yield: 5, DON: 1, FDK: 1
    };

    const evaluated = evaluateCrosses(crosses, weights);

    // Cross 1 merit = 10 * 10 = 100
    // Cross 2 merit = 10 * 20 = 200
    // Cross 3 merit = 10 * 30 = 300
    // Mean merit = 200
    expect(evaluated[0].crossName).toBe('E x F'); // Ranked 1st
    expect(evaluated[0].merit).toBe(300);
    expect(evaluated[0].ranking).toBe(1);
    expect(evaluated[0].relativeProfit).toBe(100);

    expect(evaluated[1].crossName).toBe('C x D'); // Ranked 2nd
    expect(evaluated[1].merit).toBe(200);
    expect(evaluated[1].ranking).toBe(2);
    expect(evaluated[1].relativeProfit).toBe(0);

    expect(evaluated[2].crossName).toBe('A x B'); // Ranked 3rd
    expect(evaluated[2].merit).toBe(100);
    expect(evaluated[2].ranking).toBe(3);
    expect(evaluated[2].relativeProfit).toBe(-100);
  });

  it('Ingests crossRank.csv and processes through the pipeline', () => {
    const csvPath = path.resolve(__dirname, '../../../../crossRank.csv');
    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    
    // Skip header
    const crosses: CrossCandidate[] = lines.slice(1).map(line => {
      // Split by comma respecting quotes
      const row = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
      const clean = row.map(v => v.replace(/"/g, ''));
      return {
        p1: clean[1],
        p2: clean[2],
        crossName: clean[3],
        Heading: parseFloat(clean[7]),
        Height: parseFloat(clean[8]),
        TestWeight: parseFloat(clean[9]),
        Yield: parseFloat(clean[10]),
        DON: parseFloat(clean[11]),
        FDK: parseFloat(clean[12])
      };
    }).filter(c => !isNaN(c.Heading));

    // Approximate weights deduced from regression without intercept
    const weights: EconomicWeights = {
      Heading: -4.03470,
      Height: -1.13130,
      TestWeight: 9.90637,
      Yield: 5.02598,
      DON: -15.01562,
      FDK: -0.59772
    };

    const evaluated = evaluateCrosses(crosses, weights);
    
    // We expect 1484 valid crosses from the CSV
    expect(evaluated.length).toBeGreaterThan(1400);

    // Verify sorting is applied
    expect(evaluated[0].merit).toBeGreaterThanOrEqual(evaluated[1].merit!);
    
    // Mean of merit should result in sum(relativeProfit) ~ 0
    let sumProfit = 0;
    evaluated.forEach(c => sumProfit += c.relativeProfit!);
    expect(sumProfit).toBeCloseTo(0, 5);
  });
});
