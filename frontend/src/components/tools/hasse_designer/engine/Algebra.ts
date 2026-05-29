import type { Factor, ModelTerm } from './Factor';

export type TermSet = ModelTerm[];

export function generateTermId(factors: Factor[]): string {
  if (factors.length === 0) return 'Mean';
  return factors.map(f => f.id).sort().join(':');
}

export function generateTermName(factors: Factor[]): string {
  if (factors.length === 0) return 'Mean';
  return factors.map(f => f.name).sort().join(':');
}

export function determineTermType(factors: Factor[]): 'Mean' | 'Fixed' | 'Random' | 'Residual' {
  if (factors.length === 0) return 'Mean';
  const hasRandom = factors.some(f => f.type === 'Random');
  return hasRandom ? 'Random' : 'Fixed';
}

export function createTerm(factors: Factor[], name?: string, n_base?: number): ModelTerm {
  const uniqueFactors = Array.from(new Map(factors.map(f => [f.id, f])).values());
  const id = generateTermId(uniqueFactors);
  
  if (factors.length === 0) {
    return { id: 'Mean', name: 'Mean', factors: [], type: 'Mean', n_base: 1 };
  }

  const defaultName = generateTermName(uniqueFactors);
  const defaultN = uniqueFactors.reduce((acc, f) => acc * f.levels, 1);

  return {
    id,
    name: name || defaultName,
    factors: uniqueFactors,
    type: determineTermType(uniqueFactors),
    n_base: n_base !== undefined ? n_base : defaultN
  };
}

export function add(setA: TermSet, setB: TermSet): TermSet {
  const resultMap = new Map<string, ModelTerm>();
  setA.forEach(t => resultMap.set(t.id, t));
  setB.forEach(t => resultMap.set(t.id, t));
  return Array.from(resultMap.values());
}

export function isStrictSubset(a: ModelTerm, b: ModelTerm): boolean {
  if (a.factors.length >= b.factors.length) return false;
  return a.factors.every(fa => b.factors.some(fb => fb.id === fa.id));
}

// Interaction A : B -> A:B
export function interact(setA: TermSet, setB: TermSet): TermSet {
  const resultMap = new Map<string, ModelTerm>();
  for (const a of setA) {
    for (const b of setB) {
      if (a.id === 'Mean') { resultMap.set(b.id, b); continue; }
      if (b.id === 'Mean') { resultMap.set(a.id, a); continue; }
      
      const uniqueFactors = Array.from(new Map([...a.factors, ...b.factors].map(f => [f.id, f])).values());
      const id = generateTermId(uniqueFactors);
      
      const nameParts = new Set([...a.name.split(':'), ...b.name.split(':')]);
      const name = Array.from(nameParts).sort().join(':');

      const combined: ModelTerm = {
        id,
        name,
        factors: uniqueFactors,
        type: determineTermType(uniqueFactors),
        n_base: (a.n_base || 1) * (b.n_base || 1)
      };
      
      resultMap.set(combined.id, combined);
    }
  }
  return Array.from(resultMap.values());
}

// Crossing A * B -> A + B + A:B
export function cross(setA: TermSet, setB: TermSet): TermSet {
  let result = add(setA, setB);
  result = add(result, interact(setA, setB));
  return result;
}

// Nesting A / B -> A + A:B (but with A:B named as 'B')
export function nest(setA: TermSet, setB: TermSet): TermSet {
  const result = new Map<string, ModelTerm>();
  setA.forEach(t => result.set(t.id, t));

  // Find maximal terms in A to nest B under
  const maximalA = setA.filter(a => !setA.some(other => isStrictSubset(a, other)));
  const bases = maximalA.length > 0 ? maximalA : [createTerm([])];

  for (const a of bases) {
    for (const b of setB) {
      if (b.id === 'Mean') continue;
      
      const uniqueFactors = Array.from(new Map([...a.factors, ...b.factors].map(f => [f.id, f])).values());
      const id = generateTermId(uniqueFactors);
      
      const combined: ModelTerm = {
        id,
        name: b.name, // Display name remains just B!
        factors: uniqueFactors,
        type: determineTermType(uniqueFactors),
        n_base: b.n_base // n is just global count of B!
      };
      result.set(combined.id, combined);
    }
  }

  return Array.from(result.values());
}
