import { Matrix, pseudoInverse } from 'ml-matrix';

export type MethodType = 'unrestricted' | 'restricted' | 'desired_gains' | 'pure_desired_gains';

export interface SimulationInput {
    method: MethodType;
    P: number[][];
    G: number[][];
    v?: number[];
    restrict_idx?: number[];
    delta?: number[];
    alpha?: number;
    alpha_proportion?: number;
    cycles?: number;
    ellipse_axes?: number[];
}

export class OpenIndexGenEngine {
    
    static calcUnrestrictedIndex(P: Matrix, G: Matrix, v: Matrix): Matrix {
        // b = P^-1 * G * v
        const P_inv = pseudoInverse(P);
        return P_inv.mmul(G).mmul(v);
    }

    static calcRestrictedIndex(P: Matrix, G: Matrix, v: Matrix, restrictIdx: number[]): Matrix {
        // b = [I - P^-1 G1 (G1' P^-1 G1)^-1 G1' P^-1] P^-1 G v
        const P_inv = pseudoInverse(P);
        const n = P.rows;
        const I = Matrix.eye(n, n);
        
        // Extract G1 (columns of G corresponding to restrictIdx)
        const G1 = G.selection(Array.from({length: G.rows}, (_, i) => i), restrictIdx);
        
        // term1 = G1' * P^-1 * G1
        const term1 = G1.transpose().mmul(P_inv).mmul(G1);
        const term1_inv = pseudoInverse(term1);
        
        // bracket = I - G1 * term1_inv * G1' * P_inv
        const bracket = I.sub(G1.mmul(term1_inv).mmul(G1.transpose()).mmul(P_inv));
        const R = P_inv.mmul(bracket);
        
        return R.mmul(G).mmul(v);
    }

    static calcDesiredGains(P: Matrix, G: Matrix, v: Matrix, delta: Matrix, alpha: number, restrictIdx: number[]): { b: Matrix, alphaMax: number } {
        const P_inv = pseudoInverse(P);
        const n = P.rows;
        const I = Matrix.eye(n, n);
        
        const G1 = G.selection(Array.from({length: G.rows}, (_, i) => i), restrictIdx);
        
        const term1 = G1.transpose().mmul(P_inv).mmul(G1);
        const term1_inv = pseudoInverse(term1);
        
        const bracket = I.sub(G1.mmul(term1_inv).mmul(G1.transpose()).mmul(P_inv));
        const R = P_inv.mmul(bracket);
        
        // alpha_max_sq_inv = delta' * term1_inv * delta
        const alpha_max_sq_inv_mat = delta.transpose().mmul(term1_inv).mmul(delta);
        const alpha_max_sq_inv = alpha_max_sq_inv_mat.get(0, 0);
        
        if (alpha_max_sq_inv <= 1e-12) {
            const b_restricted = R.mmul(G).mmul(v);
            return { b: b_restricted, alphaMax: 0.0 };
        }
        
        const alphaMax = 1.0 / Math.sqrt(alpha_max_sq_inv);
        if (alpha > alphaMax) {
            alpha = alphaMax;
        }
        
        // denom_sq = v' G' R G v
        const denom_sq_mat = v.transpose().mmul(G.transpose()).mmul(R).mmul(G).mmul(v);
        const denom_sq = denom_sq_mat.get(0, 0);
        
        let scaling_factor = 0.0;
        if (denom_sq > 1e-12) {
            scaling_factor = Math.sqrt(1 - (alpha * alpha) / (alphaMax * alphaMax)) / Math.sqrt(denom_sq);
        }
        
        // term_A = scaling_factor * (R G v)
        const term_A = R.mmul(G).mmul(v).mul(scaling_factor);
        
        // term_B = alpha * P^-1 G1 term1_inv delta
        const term_B = P_inv.mmul(G1).mmul(term1_inv).mmul(delta).mul(alpha);
        
        const b = term_A.add(term_B);
        return { b, alphaMax };
    }

    static calcPureDesiredGains(P: Matrix, G: Matrix, delta: Matrix): Matrix {
        const P_inv = pseudoInverse(P);
        const term1 = G.transpose().mmul(P_inv).mmul(G);
        const term1_inv = pseudoInverse(term1);
        
        const b = P_inv.mmul(G).mmul(term1_inv).mmul(delta);
        return b;
    }

    static simulate(inputs: SimulationInput): any {
        try {
            const P = new Matrix(inputs.P);
            const G = new Matrix(inputs.G);
            let v: Matrix | null = null;
            if (inputs.v) {
                // v should be column vector
                v = Matrix.columnVector(inputs.v);
            }
            
            const method = inputs.method || 'unrestricted';
            let b: Matrix;
            let alphaMax = 0.0;
            
            if (method === 'unrestricted') {
                if (!v) throw new Error("v is required for unrestricted index.");
                b = OpenIndexGenEngine.calcUnrestrictedIndex(P, G, v);
            } else if (method === 'restricted') {
                if (!v) throw new Error("v is required for restricted index.");
                const restrictIdx = inputs.restrict_idx || [];
                if (restrictIdx.length === 0) throw new Error("restrict_idx must be provided.");
                b = OpenIndexGenEngine.calcRestrictedIndex(P, G, v, restrictIdx);
            } else if (method === 'desired_gains') {
                if (!v) throw new Error("v is required for desired gains.");
                const restrictIdx = inputs.restrict_idx || [];
                const deltaArr = inputs.delta || [];
                if (restrictIdx.length === 0 || deltaArr.length === 0) {
                    throw new Error("restrict_idx and delta must be provided.");
                }
                const delta = Matrix.columnVector(deltaArr);
                
                let alpha = inputs.alpha || 0.0;
                if (inputs.alpha_proportion !== undefined) {
                    const P_inv = pseudoInverse(P);
                    const G1 = G.selection(Array.from({length: G.rows}, (_, i) => i), restrictIdx);
                    const term1 = G1.transpose().mmul(P_inv).mmul(G1);
                    const term1_inv = pseudoInverse(term1);
                    const alpha_max_sq_inv = delta.transpose().mmul(term1_inv).mmul(delta).get(0, 0);
                    if (alpha_max_sq_inv > 0) {
                        const computedAlphaMax = 1.0 / Math.sqrt(alpha_max_sq_inv);
                        alpha = inputs.alpha_proportion * computedAlphaMax;
                    } else {
                        alpha = 0.0;
                    }
                }
                
                const res = OpenIndexGenEngine.calcDesiredGains(P, G, v, delta, alpha, restrictIdx);
                b = res.b;
                alphaMax = res.alphaMax;
            } else if (method === 'pure_desired_gains') {
                const deltaArr = inputs.delta || [];
                if (deltaArr.length === 0) throw new Error("delta must be provided.");
                const delta = Matrix.columnVector(deltaArr);
                b = OpenIndexGenEngine.calcPureDesiredGains(P, G, delta);
            } else {
                throw new Error(`Unknown method: ${method}`);
            }
            
            // delta_G = b' * G => 1xN vector
            const delta_G = b.transpose().mmul(G);
            
            return {
                status: "success",
                method,
                alpha_max: alphaMax,
                weights: b.to1DArray(),
                predicted_genetic_change: delta_G.to1DArray()
            };
        } catch (err: any) {
            return { status: "error", message: err.message || String(err) };
        }
    }

    static generateGenupEllipse(G_arr: number[][], numPoints: number = 100): any {
        const G = new Matrix(G_arr);
        const N = G.rows;
        if (N === 2) {
            return OpenIndexGenEngine._generate2DEllipse(G, numPoints);
        }
        
        const result: Record<string, any> = {};
        for (let i = 0; i < N; i++) {
            for (let j = i + 1; j < N; j++) {
                const G2 = G.selection([i, j], [i, j]);
                result[`${i}_${j}`] = OpenIndexGenEngine._generate2DEllipse(G2, numPoints);
            }
        }
        return result;
    }

    static _generate2DEllipse(G: Matrix, numPoints: number): { x: number[], y: number[] } {
        const theta = Array.from({length: numPoints}, (_, i) => (i / (numPoints - 1)) * 2 * Math.PI);
        const x_pts: number[] = [];
        const y_pts: number[] = [];
        
        for (const t of theta) {
            const v = Matrix.columnVector([Math.cos(t), Math.sin(t)]);
            const var_I = v.transpose().mmul(G).mmul(v).get(0, 0);
            if (var_I > 1e-12) {
                const sigma_I = Math.sqrt(var_I);
                const dg = G.mmul(v).mul(1.0 / sigma_I);
                x_pts.push(dg.get(0, 0));
                y_pts.push(dg.get(1, 0));
            }
        }
        return { x: x_pts, y: y_pts };
    }

    static reverseGenupEllipse(G_arr: number[][], target_x: number, target_y: number): any {
        const G = new Matrix(G_arr);
        const target_dg = Matrix.columnVector([target_x, target_y]);
        const G_inv = pseudoInverse(G);
        
        let v_rev = G_inv.mmul(target_dg);
        const norm = Math.sqrt(v_rev.get(0,0)*v_rev.get(0,0) + v_rev.get(1,0)*v_rev.get(1,0));
        if (norm > 1e-12) {
            v_rev = v_rev.mul(1.0 / norm);
        }
        
        const b_rev = v_rev;
        const var_I = b_rev.transpose().mmul(G).mmul(b_rev).get(0,0);
        const sigma_I = Math.sqrt(var_I);
        const dg_rev = G.mmul(b_rev).mul(1.0 / sigma_I);
        
        const H = v_rev.transpose().mmul(dg_rev).get(0,0);
        
        return {
            v: v_rev.to1DArray(),
            b: b_rev.to1DArray(),
            delta_G: dg_rev.to1DArray(),
            H: H
        };
    }
}
