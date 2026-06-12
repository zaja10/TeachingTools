import type { ModelTerm } from './Factor';

export interface HasseNode extends ModelTerm {
  n: number;
  df: number;
}

export interface HasseEdge {
  id: string;
  source: string; // id of parent (marginal)
  target: string; // id of child (conditional/interaction)
}

export interface HasseGraph {
  nodes: HasseNode[];
  edges: HasseEdge[];
}

// Check if term A is a strict subset of term B
export function isStrictSubset(a: ModelTerm, b: ModelTerm): boolean {
  if (a.factors.length >= b.factors.length) return false;
  
  // Every factor in A must be in B
  const aFactorIds = new Set(a.factors.map(f => f.id));
  const bFactorIds = new Set(b.factors.map(f => f.id));
  
  for (const id of aFactorIds) {
    if (!bFactorIds.has(id)) return false;
  }
  return true;
}

export function buildHasseGraph(terms: ModelTerm[], overrides: Record<string, { n?: number, df?: number }> = {}, meanId: string = 'Mean'): HasseGraph {
  // Ensure Mean term is always present
  const allTerms = [...terms];
  if (!allTerms.some(t => t.id === meanId)) {
    allTerms.push({
      id: meanId,
      name: meanId,
      factors: [],
      type: 'Mean',
      n_base: 1
    });
  }

  // Deduplicate just in case
  const uniqueTerms = Array.from(new Map(allTerms.map(t => [t.id, t])).values());

  // Determine all subset relationships (directed edges)
  const allEdges: HasseEdge[] = [];
  for (const a of uniqueTerms) {
    for (const b of uniqueTerms) {
      if (isStrictSubset(a, b)) {
        allEdges.push({
          id: `${a.id}->${b.id}`,
          source: a.id,
          target: b.id
        });
      }
    }
  }

  // Transitive Reduction: Remove edge A->B if there exists C such that A->C and C->B
  const edges = allEdges.filter(edge => {
    const { source: a, target: b } = edge;
    const hasIntermediate = uniqueTerms.some(c => 
      c.id !== a && c.id !== b &&
      isStrictSubset(uniqueTerms.find(t => t.id === a)!, c) &&
      isStrictSubset(c, uniqueTerms.find(t => t.id === b)!)
    );
    return !hasIntermediate;
  });

  // Calculate df for each node.
  // Must be done topologically (from Mean to most complex)
  // Sort terms by number of factors (so subsets are calculated first)
  uniqueTerms.sort((a, b) => a.factors.length - b.factors.length);

  const dfMap = new Map<string, number>();

  const nodes: HasseNode[] = uniqueTerms.map(term => {
    let n: number;
    if (overrides[term.id]?.n !== undefined) {
      n = overrides[term.id].n!;
    } else {
      n = term.n_base !== undefined ? term.n_base : term.factors.reduce((acc, f) => acc * f.levels, 1);
    }

    // 2. Subtract df of all STRICT subsets (not just immediate parents, ALL nodes strictly above in the Hasse diagram)
    let subsetsDfSum = 0;
    for (const other of uniqueTerms) {
      if (isStrictSubset(other, term)) {
        subsetsDfSum += dfMap.get(other.id) || 0;
      }
    }

    let df = n - subsetsDfSum;
    if (overrides[term.id]?.df !== undefined) {
      df = overrides[term.id].df!;
    }
    
    dfMap.set(term.id, df);

    return {
      ...term,
      n,
      df
    };
  });

  return { nodes, edges };
}
