export interface ParentCandidate {
  gid: string;
  Heading: number;
  Height: number;
  TestWeight: number;
  Yield: number;
  DON: number;
  FDK: number;
  [trait: string]: number | string;
}

export interface CrossCandidate {
  p1: string;
  p2: string;
  crossName: string;
  
  // Predicted Performance for traits
  Heading: number;
  Height: number;
  TestWeight: number;
  Yield: number;
  DON: number;
  FDK: number;

  merit?: number;
  ranking?: number;
  relativeProfit?: number;
}

export interface EconomicWeights {
  Heading: number;
  Height: number;
  TestWeight: number;
  Yield: number;
  DON: number;
  FDK: number;
}
