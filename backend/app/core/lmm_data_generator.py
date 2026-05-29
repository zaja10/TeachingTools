import numpy as np

def generate_lmm_data():
    np.random.seed(42)
    genotypes = ["Genotype 1", "Genotype 2", "Genotype 3", "Genotype 4"]
    environments = ["Env 1", "Env 2", "Env 3"]
    reps = 10
    
    # Ground truth parameters
    mu_true = 100.0
    g_effects = {"Genotype 1": -15.0, "Genotype 2": 5.0, "Genotype 3": 10.0, "Genotype 4": 0.0}
    e_effects = {"Env 1": -20.0, "Env 2": 0.0, "Env 3": 20.0}
    
    # GxE effects (ensure they sum to 0 across G and across E for perfect balance)
    # We'll just define some non-zero interactions
    gxe_effects = {
        "Genotype 1": {"Env 1": 15.0, "Env 2": -5.0, "Env 3": -10.0},
        "Genotype 2": {"Env 1": -10.0, "Env 2": 15.0, "Env 3": -5.0},
        "Genotype 3": {"Env 1": -5.0, "Env 2": -10.0, "Env 3": 15.0},
        "Genotype 4": {"Env 1": 0.0, "Env 2": 0.0, "Env 3": 0.0}
    }
    
    data = []
    # Generate balanced dataset
    for g in genotypes:
        for e in environments:
            for _ in range(reps):
                # Add a bit of noise
                y = mu_true + g_effects[g] + e_effects[e] + gxe_effects[g][e] + np.random.normal(0, 10.0)
                data.append({"genotype": g, "env": e, "y": float(y)})

    # Now calculate empirical marginal means (BLUEs for balanced data)
    y_all = [d["y"] for d in data]
    mu_hat = np.mean(y_all)
    
    # Calculate G Fixed Effects
    G_fixed = {}
    for g in genotypes:
        mean_g = np.mean([d["y"] for d in data if d["genotype"] == g])
        G_fixed[g] = mean_g - mu_hat
        
    # Calculate E Fixed Effects
    E_fixed = {}
    for e in environments:
        mean_e = np.mean([d["y"] for d in data if d["env"] == e])
        E_fixed[e] = mean_e - mu_hat
        
    # Calculate GxE Fixed Effects
    GxE_fixed = {}
    for g in genotypes:
        GxE_fixed[g] = {}
        for e in environments:
            cell_mean = np.mean([d["y"] for d in data if d["genotype"] == g and d["env"] == e])
            # Interaction = CellMean - (mu + g_effect + e_effect)
            GxE_fixed[g][e] = cell_mean - (mu_hat + G_fixed[g] + E_fixed[e])

    # Calculate Shrinkage (Simulated BLUPs)
    # We will simulate reliability H2 = variance(effect) / (variance(effect) + variance(error)/n)
    # To make it visually obvious, we'll just hardcode shrinkage factors
    # G shrinkage: 0.6 (pulls 40% towards 0)
    # E shrinkage: 0.8 (pulls 20% towards 0)
    # GxE shrinkage: 0.4 (pulls 60% towards 0)
    
    G_random = {g: effect * 0.5 for g, effect in G_fixed.items()}
    E_random = {e: effect * 0.7 for e, effect in E_fixed.items()}
    
    GxE_random = {}
    for g in genotypes:
        GxE_random[g] = {}
        for e in environments:
            GxE_random[g][e] = GxE_fixed[g][e] * 0.3

    return {
        "points": data,
        "components": {
            "mu": float(mu_hat),
            "G_fixed": G_fixed,
            "G_random": G_random,
            "E_fixed": E_fixed,
            "E_random": E_random,
            "GxE_fixed": GxE_fixed,
            "GxE_random": GxE_random
        }
    }
