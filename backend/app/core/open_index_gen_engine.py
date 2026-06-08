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

    def evaluate(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """Not yet implemented for OpenIndexGen."""
        return {"status": "not_implemented"}

