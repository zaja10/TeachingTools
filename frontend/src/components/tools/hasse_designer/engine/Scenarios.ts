import type { Factor } from './Factor';

export interface Scenario {
  id: string;
  title: string;
  description: string;
  factors: Factor[];
  unitFormula: string;
  treatFormula: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'split-plot',
    title: 'Split-Plot Design (Field Trial)',
    description: 'A classic agricultural split-plot design. Whole plots (Irrigation) are applied to main plots within blocks, and sub-plots (Fertilizer) are applied to smaller units within the main plots.',
    factors: [
      { id: '1', name: 'Block', levels: 4, type: 'Random' },
      { id: '2', name: 'Plot', levels: 2, type: 'Random' },
      { id: '3', name: 'SubPlot', levels: 3, type: 'Random' },
      { id: '4', name: 'Irrigation', levels: 2, type: 'Fixed' },
      { id: '5', name: 'Fertilizer', levels: 3, type: 'Fixed' }
    ],
    unitFormula: 'Block/Plot/SubPlot',
    treatFormula: 'Irrigation * Fertilizer'
  },
  {
    id: 'rcbd',
    title: 'Randomized Complete Block Design (RCBD)',
    description: 'The standard RCBD where every treatment appears exactly once in every block.',
    factors: [
      { id: '1', name: 'Block', levels: 4, type: 'Random' },
      { id: '2', name: 'Plot', levels: 5, type: 'Random' },
      { id: '3', name: 'Treatment', levels: 5, type: 'Fixed' }
    ],
    unitFormula: 'Block * Plot',
    treatFormula: 'Treatment'
  },
  {
    id: 'repeated-measures',
    title: 'Repeated Measures (Greenhouse)',
    description: 'Plants are grown in pots within a greenhouse. Measurements are taken on the same plants across multiple time points.',
    factors: [
      { id: '1', name: 'GH', levels: 2, type: 'Random' },
      { id: '2', name: 'Bench', levels: 4, type: 'Random' },
      { id: '3', name: 'Pot', levels: 10, type: 'Random' },
      { id: '4', name: 'Time', levels: 5, type: 'Fixed' },
      { id: '5', name: 'Genotype', levels: 10, type: 'Fixed' }
    ],
    unitFormula: '(GH/Bench/Pot) * Time',
    treatFormula: 'Genotype * Time'
  },
  {
    id: 'tissue-culture',
    title: 'Tissue Culture (Growth Chamber)',
    description: 'Petri dishes containing explants are placed in incubators. Two media types are tested, and growth is measured.',
    factors: [
      { id: '1', name: 'Incubator', levels: 3, type: 'Random' },
      { id: '2', name: 'Shelf', levels: 4, type: 'Random' },
      { id: '3', name: 'Dish', levels: 5, type: 'Random' },
      { id: '4', name: 'Media', levels: 2, type: 'Fixed' }
    ],
    unitFormula: 'Incubator/Shelf/Dish',
    treatFormula: 'Media'
  }
];
