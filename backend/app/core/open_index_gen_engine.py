import numpy as np
from typing import Dict, Any, Union
from .engine_base import TeachingEngine

class OpenIndexGenEngine(TeachingEngine):
    """
    Implements multi-trait selection index theory under linear constraints
    (Brascamp, 1984).
    """

    def validate_inputs(self, P: np.ndarray, G: np.ndarray, v: np.ndarray) -> None:
        """
        Validates the dimensional conformity and properties of the input matrices.
        """
        if P.shape[0] != P.shape[1]:
            raise ValueError("Phenotypic matrix P must be square.")
        
        n_info_sources = P.shape[0]
        
        if G.shape[0] != n_info_sources:
            raise ValueError(f"Genetic matrix G must have {n_info_sources} rows (matching P).")
            
        m_traits = G.shape[1]
        
        if v is not None:
            if v.shape[0] != m_traits:
                raise ValueError(f"Economic weights vector v must have {m_traits} elements (matching columns of G).")
            
        # Check positive definiteness of P by attempting Cholesky decomposition
        try:
            np.linalg.cholesky(P)
        except np.linalg.LinAlgError:
            raise ValueError("Phenotypic matrix P is not positive definite.")

    def calc_unrestricted_index(self, P: np.ndarray, G: np.ndarray, v: np.ndarray) -> np.ndarray:
        """
        Calculates Unrestricted Selection Index (Hazel, 1943).
        b = P^-1 * G * v
        """
        P_inv = np.linalg.pinv(P)
        return P_inv @ G @ v

    def calc_restricted_index(self, P: np.ndarray, G: np.ndarray, v: np.ndarray, restrict_idx: list[int]) -> np.ndarray:
        """
        Calculates Restricted Selection Index (Kempthorne & Nordskog, 1959).
        restrict_idx: indices of columns in G to restrict genetic change to 0.
        """
        P_inv = np.linalg.pinv(P)
        n = P.shape[0]
        I = np.eye(n)
        
        G1 = G[:, restrict_idx]
        
        # Robust pseudo-inverse for (G1' * P^-1 * G1)
        term1 = G1.T @ P_inv @ G1
        term1_inv = np.linalg.pinv(term1)
        
        # R = P^-1 [I - G1 (G1' P^-1 G1)^-1 G1' P^-1]
        bracket = I - (G1 @ term1_inv @ G1.T @ P_inv)
        R = P_inv @ bracket
        
        return R @ G @ v

    def calc_desired_gains(self, P: np.ndarray, G: np.ndarray, v: np.ndarray, delta: np.ndarray, alpha: float, restrict_idx: list[int]) -> tuple[np.ndarray, float]:
        """
        Calculates Desired Genetic Gains Index (Pešek & Baker, 1969; Brascamp, 1979).
        delta: vector of target genetic changes for the restricted traits.
        alpha: proportional allocation.
        restrict_idx: indices of columns in G corresponding to the restricted traits.
        Returns the index weights and alpha_max.
        """
        P_inv = np.linalg.pinv(P)
        n = P.shape[0]
        I = np.eye(n)
        
        G1 = G[:, restrict_idx]
        
        term1 = G1.T @ P_inv @ G1
        term1_inv = np.linalg.pinv(term1)
        
        bracket = I - (G1 @ term1_inv @ G1.T @ P_inv)
        R = P_inv @ bracket
        
        # alpha_max = (delta' [G1' P^-1 G1]^-1 delta)^-1/2
        alpha_max_sq_inv = delta.T @ term1_inv @ delta
        if alpha_max_sq_inv <= 0:
            raise ValueError("Invalid target genetic changes delta, leading to negative or zero term.")
            
        alpha_max = 1.0 / np.sqrt(alpha_max_sq_inv.item())
        
        if alpha > alpha_max:
            raise ValueError(f"Alpha parameter ({alpha}) exceeds maximum attainable desired gains ({alpha_max}).")
            
        # First term scaling factor
        denom_sq = v.T @ G.T @ R @ G @ v
        if denom_sq <= 0:
            raise ValueError("Denominator for scaling factor must be positive.")
        
        scaling_factor = np.sqrt(1 - (alpha**2 / alpha_max**2)) / np.sqrt(denom_sq.item())
        
        # First term
        term_A = scaling_factor * (R @ G @ v)
        
        # Second term
        term_B = alpha * P_inv @ G1 @ term1_inv @ delta
        
        b = term_A + term_B
        return b.reshape(-1, 1), alpha_max

    def calc_pure_desired_gains(self, P: np.ndarray, G: np.ndarray, delta: np.ndarray) -> np.ndarray:
        """
        Calculates Pure Desired Genetic Gains Index (Pešek & Baker, 1969)
        without economic weights.
        b = P^-1 * G * (G' * P^-1 * G)^-1 * delta
        """
        P_inv = np.linalg.pinv(P)
        term1 = G.T @ P_inv @ G
        term1_inv = np.linalg.pinv(term1)
        
        b = P_inv @ G @ term1_inv @ delta
        return b.reshape(-1, 1)

    def simulate(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes the simulation.
        inputs should contain:
        - method: 'unrestricted', 'restricted', 'desired_gains'
        - P: list of lists
        - G: list of lists
        - v: list
        - restrict_idx: list of integers (optional for unrestricted)
        - delta: list (optional, for desired gains)
        - alpha: float (optional, for desired gains)
        """
        try:
            P = np.array(inputs['P'], dtype=float)
            G = np.array(inputs['G'], dtype=float)
            
            v = None
            if inputs.get('v') is not None:
                v = np.array(inputs['v'], dtype=float).reshape(-1, 1)
            
            self.validate_inputs(P, G, v)
            
            method = inputs.get('method', 'unrestricted')
            
            response = {
                "status": "success",
                "method": method
            }
            
            if method == 'unrestricted':
                b = self.calc_unrestricted_index(P, G, v)
                
            elif method == 'restricted':
                restrict_idx = inputs.get('restrict_idx', [])
                if not restrict_idx:
                    raise ValueError("restrict_idx must be provided for restricted index.")
                b = self.calc_restricted_index(P, G, v, restrict_idx)
                
            elif method == 'desired_gains':
                restrict_idx = inputs.get('restrict_idx', [])
                delta = np.array(inputs.get('delta', []), dtype=float).reshape(-1, 1)
                
                # We will first calculate alpha_max using a dummy call if needed, but wait:
                # calc_desired_gains computes alpha_max inside.
                # Let's pass alpha_proportion to calc_desired_gains if provided.
                alpha_prop = inputs.get('alpha_proportion')
                if alpha_prop is not None:
                    # We need to compute alpha_max first
                    P_inv = np.linalg.pinv(P)
                    G1 = G[:, restrict_idx]
                    term1 = G1.T @ P_inv @ G1
                    term1_inv = np.linalg.pinv(term1)
                    alpha_max_sq_inv = delta.T @ term1_inv @ delta
                    if alpha_max_sq_inv > 0:
                        computed_alpha_max = 1.0 / np.sqrt(alpha_max_sq_inv.item())
                        alpha = float(alpha_prop) * computed_alpha_max
                    else:
                        alpha = 0.0
                else:
                    alpha = float(inputs.get('alpha', 0.0))
                
                if not restrict_idx or delta.size == 0:
                    raise ValueError("restrict_idx and delta must be provided for desired gains.")
                    
                b, alpha_max = self.calc_desired_gains(P, G, v, delta, alpha, restrict_idx)
                response["alpha_max"] = alpha_max
                
            elif method == 'pure_desired_gains':
                delta = np.array(inputs.get('delta', []), dtype=float).reshape(-1, 1)
                if delta.size == 0:
                    raise ValueError("delta must be provided for pure desired gains.")
                b = self.calc_pure_desired_gains(P, G, delta)
            else:
                raise ValueError(f"Unknown method: {method}")
                
            # Predicted genetic change overall: delta_G = b' G
            delta_G = b.T @ G
            
            response["weights"] = b.flatten().tolist()
            response["predicted_genetic_change"] = delta_G.flatten().tolist()
            
            # Generate 2D Ellipse if requested
            ellipse_axes = inputs.get('ellipse_axes')
            if ellipse_axes is not None and len(ellipse_axes) == 2:
                idx_x, idx_y = ellipse_axes
                # Extract 2x2 submatrix
                G2 = G[np.ix_(ellipse_axes, ellipse_axes)]
                
                # Calculate ellipse points: x' G2^-1 x = 1
                # Use eigenvalue decomposition
                evals, evecs = np.linalg.eigh(G2)
                t = np.linspace(0, 2 * np.pi, 100)
                
                # Ensure eigenvalues are positive to avoid math errors
                evals = np.maximum(evals, 1e-10)
                
                x_pts = np.sqrt(evals[0]) * evecs[0, 0] * np.cos(t) + np.sqrt(evals[1]) * evecs[0, 1] * np.sin(t)
                y_pts = np.sqrt(evals[0]) * evecs[1, 0] * np.cos(t) + np.sqrt(evals[1]) * evecs[1, 1] * np.sin(t)
                
                response["ellipse"] = {
                    "x": x_pts.tolist(),
                    "y": y_pts.tolist()
                }
            
            # Simulate generations if cycles provided
            cycles = int(inputs.get('cycles', 0))
            if cycles > 0:
                generation_data = []
                current_g = np.zeros_like(delta_G)
                for i in range(cycles + 1):
                    generation_data.append({
                        "generation": i,
                        "cumulative_genetic_change": current_g.flatten().tolist()
                    })
                    current_g += delta_G
                response["generation_data"] = generation_data
            
            return response
            
        except Exception as e:
            return {
                "status": "error",
                "message": str(e)
            }

    @staticmethod
    def generate_genup_ellipse(G: np.ndarray, num_points: int = 100) -> dict:
        """
        Generates the possible selection responses ellipse by sweeping v.
        If G is 2x2, returns {"x": [...], "y": [...]}.
        If G is NxN, returns a dict of {"i_j": {"x": [...], "y": [...]}} for all i < j.
        """
        N = G.shape[0]
        if N == 2:
            return OpenIndexGenEngine._generate_2d_ellipse(G, num_points)
            
        result = {}
        for i in range(N):
            for j in range(i + 1, N):
                G2 = G[np.ix_([i, j], [i, j])]
                result[f"{i}_{j}"] = OpenIndexGenEngine._generate_2d_ellipse(G2, num_points)
        return result

    @staticmethod
    def _generate_2d_ellipse(G: np.ndarray, num_points: int) -> dict:
        P = G
        theta = np.linspace(0, 2*np.pi, num_points)
        x_pts = []
        y_pts = []
        for t in theta:
            v = np.array([np.cos(t), np.sin(t)])
            b = v
            var_I = b.T @ P @ b
            if var_I > 1e-12:
                sigma_I = np.sqrt(var_I)
                dg = (G @ b) / sigma_I
                x_pts.append(dg[0])
                y_pts.append(dg[1])
        return {"x": x_pts, "y": y_pts}

    @staticmethod
    def reverse_genup_ellipse(G: np.ndarray, target_x: float, target_y: float) -> dict:
        """
        Reverse-engineers economic weights (v) and index weights (b) 
        given a clicked target point (Delta G) on the boundary.
        """
        target_dg = np.array([target_x, target_y])
        G_inv = np.linalg.inv(G)
        v_rev = G_inv @ target_dg
        norm = np.linalg.norm(v_rev)
        if norm > 1e-12:
            v_rev = v_rev / norm
            
        b_rev = v_rev
        sigma_I = np.sqrt(b_rev.T @ G @ b_rev)
        dg_rev = (G @ b_rev) / sigma_I
        
        # Isoeconomic line: v1*x + v2*y = H => y = (H - v1*x)/v2
        H = v_rev @ dg_rev
        
        return {
            "v": v_rev.tolist(),
            "b": b_rev.tolist(),
            "delta_G": dg_rev.tolist(),
            "H": float(H)
        }

    def evaluate(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Not yet implemented for OpenIndexGen."""
        return {"status": "not_implemented"}

