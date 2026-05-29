import type { Factor, ModelTerm } from './Factor';
import { cross, nest, interact, add, createTerm, type TermSet } from './Algebra';

function tokenize(formula: string): string[] {
  const tokens: string[] = [];
  const regex = /([+*/:()])|([a-zA-Z0-9_]+)/g;
  let match;
  while ((match = regex.exec(formula)) !== null) {
    if (match[1]) tokens.push(match[1]);
    if (match[2]) tokens.push(match[2]);
  }
  return tokens;
}

const PRECEDENCE: Record<string, number> = {
  ':': 3,
  '*': 2,
  '/': 2,
  '+': 1
};

export function parseFormula(formula: string, availableFactors: Factor[]): ModelTerm[] {
  const factorMap = new Map<string, Factor>();
  availableFactors.forEach(f => factorMap.set(f.name, f));

  const tokens = tokenize(formula);
  if (tokens.length === 0) return [];

  const output: (TermSet | string)[] = [];
  const operators: string[] = [];

  for (const token of tokens) {
    if (token === '(') {
      operators.push(token);
    } else if (token === ')') {
      while (operators.length > 0 && operators[operators.length - 1] !== '(') {
        output.push(operators.pop()!);
      }
      operators.pop(); // Pop '('
    } else if (PRECEDENCE[token]) {
      while (
        operators.length > 0 &&
        operators[operators.length - 1] !== '(' &&
        PRECEDENCE[operators[operators.length - 1]] >= PRECEDENCE[token]
      ) {
        output.push(operators.pop()!);
      }
      operators.push(token);
    } else {
      // Identifier
      const f = factorMap.get(token);
      if (f) {
        output.push([createTerm([f])]);
      } else {
        throw new Error(`Unknown factor: ${token}`);
      }
    }
  }

  while (operators.length > 0) {
    const op = operators.pop()!;
    if (op === '(' || op === ')') throw new Error('Mismatched parentheses in formula');
    output.push(op);
  }

  // Evaluate postfix
  const stack: TermSet[] = [];
  for (const item of output) {
    if (typeof item === 'string') {
      const b = stack.pop();
      const a = stack.pop();
      if (!a || !b) throw new Error('Invalid formula structure: Check your operators');
      
      if (item === '+') stack.push(add(a, b));
      else if (item === '*') stack.push(cross(a, b));
      else if (item === '/') stack.push(nest(a, b));
      else if (item === ':') stack.push(interact(a, b));
      else throw new Error(`Unknown operator: ${item}`);
    } else {
      stack.push(item);
    }
  }

  if (stack.length !== 1) {
    if (stack.length === 0) return [];
    throw new Error('Invalid formula structure');
  }
  
  const finalTerms = stack[0];

  const unique = new Map<string, ModelTerm>();
  for (const t of finalTerms) {
    unique.set(t.id, t);
  }

  return Array.from(unique.values());
}
