import { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { RefreshCw, Play, Settings2, Database } from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8000/api/v1/tools/open_index_gen';

export default function OpenIndexGenView() {
  const [availableTraits, setAvailableTraits] = useState<string[]>([]);
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [method, setMethod] = useState<string>('unrestricted');
  const [economicWeights, setEconomicWeights] = useState<Record<string, number>>({});
  const [desiredGains, setDesiredGains] = useState<Record<string, number>>({});
  const [restrictedTraits, setRestrictedTraits] = useState<Record<string, boolean>>({});
  const [alphaProportion, setAlphaProportion] = useState<number>(0.5);
  const [cycles, setCycles] = useState<number>(10);
  
  const [results, setResults] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/dataset/traits`)
      .then(r => r.json())
      .then(data => {
        if (data.traits) setAvailableTraits(data.traits);
      })
      .catch(e => setError("Failed to load traits from dataset: " + e.message));
  }, []);

  const handleTraitToggle = (trait: string) => {
    setSelectedTraits(prev => {
      const newSelection = prev.includes(trait) ? prev.filter(t => t !== trait) : [...prev, trait];
      
      // Initialize defaults if newly selected
      if (!prev.includes(trait)) {
        setEconomicWeights(ew => ({ ...ew, [trait]: 1.0 }));
        setDesiredGains(dg => ({ ...dg, [trait]: 1.0 }));
      }
      return newSelection;
    });
  };

  const handleSimulate = async () => {
    if (selectedTraits.length < 2) {
      setError("Please select at least 2 traits.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch covariance matrix
      const matRes = await fetch(`${API_BASE}/dataset/matrix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ traits: selectedTraits })
      });
      const matData = await matRes.json();
      if (!matRes.ok) throw new Error(matData.detail || "Failed to fetch matrix");
      
      const covMatrix = matData.covariance_matrix;
      
      // 2. Build payload for simulation
      const v = selectedTraits.map(t => economicWeights[t] || 0);
      const restrict_idx = selectedTraits.map((t, idx) => restrictedTraits[t] ? idx : -1).filter(i => i >= 0);
      
      let delta: number[] = [];
      if (method === 'pure_desired_gains') {
        delta = selectedTraits.map(t => desiredGains[t] || 0);
      } else if (method === 'desired_gains') {
        delta = restrict_idx.map(idx => desiredGains[selectedTraits[idx]] || 0);
      }
      
      const simPayload = {
        method,
        P: covMatrix,
        G: covMatrix,
        v,
        restrict_idx: restrict_idx.length > 0 ? restrict_idx : undefined,
        delta: delta.length > 0 ? delta : undefined,
        alpha_proportion: method === 'desired_gains' ? alphaProportion : undefined,
        cycles
      };

      const simRes = await fetch(`${API_BASE}/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(simPayload)
      });
      const simData = await simRes.json();
      if (!simRes.ok || simData.status === 'error') throw new Error(simData.detail || simData.message || "Simulation failed");
      
      setResults(simData);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  // Plot preparation
  const plotData: Array<Record<string, unknown>> = [];
  if (results && Array.isArray(results.generation_data)) {
    const genData = results.generation_data as Array<{ generation: number; cumulative_genetic_change: number[] }>;
    selectedTraits.forEach((trait, idx) => {
      plotData.push({
        x: genData.map(d => d.generation),
        y: genData.map(d => d.cumulative_genetic_change[idx]),
        type: 'scatter',
        mode: 'lines+markers',
        name: trait,
        line: { width: 3 }
      });
    });
  }

  return (
    <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', color: 'var(--text-primary)' }}>Selection Index Generator</h1>
        <p style={{ color: 'var(--text-muted)' }}>Dynamically calculate multi-trait index weights using Brascamp & Pešek theories.</p>
      </header>

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid #ef4444', color: '#ef4444' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '2rem' }}>
        
        {/* LEFT CONTROL PANEL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px' }}>
          
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-accent)' }}>
              <Database size={18} /> Available Traits (BLUPs)
            </h3>
            <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--border-light)', padding: '0.5rem', borderRadius: '8px' }}>
              {availableTraits.map(trait => (
                <label key={trait} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem' }}>
                  <input type="checkbox" checked={selectedTraits.includes(trait)} onChange={() => handleTraitToggle(trait)} />
                  <span style={{ fontSize: '0.85rem' }}>{trait}</span>
                </label>
              ))}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Covariances are derived directly from the dataset.</p>
          </div>

          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-accent)' }}>
              <Settings2 size={18} /> Configuration
            </h3>
            
            <label style={{ display: 'block', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>Selection Paradigm</div>
              <select 
                value={method} 
                onChange={e => setMethod(e.target.value)}
                style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-deep)', border: '1px solid var(--border-light)', color: 'white', borderRadius: '4px' }}
              >
                <option value="unrestricted">Unrestricted (Net Merit)</option>
                <option value="restricted">Restricted (Force ΔG = 0)</option>
                <option value="desired_gains">Desired Gains (Hybrid)</option>
                <option value="pure_desired_gains">Pure Desired Gains</option>
              </select>
            </label>

            {method === 'desired_gains' && (
              <label style={{ display: 'block', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>Allocation Proportion (α)</div>
                <input 
                  type="range" min="0" max="1" step="0.01" 
                  value={alphaProportion} onChange={e => setAlphaProportion(parseFloat(e.target.value))}
                  style={{ width: '100%' }}
                />
                <div style={{ fontSize: '0.75rem', textAlign: 'right' }}>{Math.round(alphaProportion * 100)}% of Max</div>
              </label>
            )}
            
            <label style={{ display: 'block' }}>
              <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem' }}>Simulation Cycles</div>
              <input 
                type="number" min="1" max="50" 
                value={cycles} onChange={e => setCycles(parseInt(e.target.value))}
                style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-deep)', border: '1px solid var(--border-light)', color: 'white', borderRadius: '4px' }}
              />
            </label>
          </div>

          <button 
            onClick={handleSimulate} 
            disabled={loading}
            style={{ 
              background: 'linear-gradient(135deg, var(--color-accent), #6366f1)', 
              color: 'white', border: 'none', padding: '0.75rem', borderRadius: '8px', 
              fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', cursor: 'pointer' 
            }}
          >
            {loading ? <RefreshCw size={18} className="animate-spin" /> : <Play size={18} />}
            Run Simulation
          </button>
        </div>

        {/* RIGHT DISPLAY PANEL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          
          {/* Parameter Weights Grid */}
          {selectedTraits.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px' }}>
              <h3 style={{ margin: '0 0 1rem 0', color: 'var(--color-accent)' }}>Trait Parameters</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-light)', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Trait</th>
                    {method !== 'pure_desired_gains' && <th style={{ padding: '0.5rem' }}>Economic Weight ($v$)</th>}
                    {(method === 'desired_gains' || method === 'pure_desired_gains') && <th style={{ padding: '0.5rem' }}>Target Gain ($\delta$)</th>}
                    {(method === 'restricted' || method === 'desired_gains') && <th style={{ padding: '0.5rem' }}>Constraint</th>}
                  </tr>
                </thead>
                <tbody>
                  {selectedTraits.map(trait => (
                    <tr key={trait} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '0.5rem' }}>{trait}</td>
                      {method !== 'pure_desired_gains' && (
                        <td style={{ padding: '0.5rem' }}>
                          <input type="number" step="0.1" value={economicWeights[trait] || 0} onChange={e => setEconomicWeights(prev => ({...prev, [trait]: parseFloat(e.target.value)}))} style={{ width: '70px', padding: '0.25rem', background: 'var(--bg-deep)', color: 'white', border: '1px solid var(--border-light)' }} />
                        </td>
                      )}
                      {(method === 'desired_gains' || method === 'pure_desired_gains') && (
                        <td style={{ padding: '0.5rem' }}>
                          <input type="number" step="0.1" value={desiredGains[trait] || 0} onChange={e => setDesiredGains(prev => ({...prev, [trait]: parseFloat(e.target.value)}))} style={{ width: '70px', padding: '0.25rem', background: 'var(--bg-deep)', color: 'white', border: '1px solid var(--border-light)' }} />
                        </td>
                      )}
                      {(method === 'restricted' || method === 'desired_gains') && (
                        <td style={{ padding: '0.5rem' }}>
                          <label><input type="checkbox" checked={!!restrictedTraits[trait]} onChange={e => setRestrictedTraits(prev => ({...prev, [trait]: e.target.checked}))} /> Constrained</label>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Results Output */}
          {results && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: '#10b981' }}>Computed Weights ($b$)</h3>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {selectedTraits.map((t, idx) => (
                    <li key={t} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.85rem' }}>{t}</span>
                      <strong style={{ fontFamily: 'monospace' }}>
                        {Array.isArray(results.weights) ? Number(results.weights[idx]).toFixed(4) : "0.0000"}
                      </strong>
                    </li>
                  ))}
                </ul>
              </div>
              
              <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px' }}>
                <h3 style={{ margin: '0 0 1rem 0', color: 'var(--color-accent)' }}>Cumulative Genetic Change</h3>
                {plotData.length > 0 && (
                  <Plot
                    data={plotData}
                    layout={{
                      autosize: true,
                      height: 300,
                      margin: { t: 10, r: 10, b: 40, l: 40 },
                      paper_bgcolor: 'transparent',
                      plot_bgcolor: 'transparent',
                      font: { color: '#e2e8f0' },
                      xaxis: { title: { text: 'Generations' }, gridcolor: 'rgba(255,255,255,0.1)' },
                      yaxis: { title: { text: 'ΔG' }, gridcolor: 'rgba(255,255,255,0.1)' }
                    }}
                    useResizeHandler={true}
                    style={{ width: '100%', height: '100%' }}
                  />
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
