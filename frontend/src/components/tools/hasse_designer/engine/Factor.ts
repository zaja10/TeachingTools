export type FactorType = 'Fixed' | 'Random';

export interface Factor {
  id: string;
  name: string;
  levels: number;
  type: FactorType;
}

export interface ModelTerm {
  id: string; // Unique string representation
  name: string; // Human readable name
  factors: Factor[];
  type: 'Mean' | 'Fixed' | 'Random' | 'Residual';
  n_base?: number;
}
