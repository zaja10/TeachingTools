import { useState, useEffect, useRef } from 'react';
import { Database, MousePointerClick, Settings, Activity, HelpCircle, X } from 'lucide-react';
import { InteractiveEllipse } from './InteractiveEllipse';

const API_BASE = 'http://127.0.0.1:8000/api/v1/tools/open_index_gen';

type MethodType = 'unrestricted' | 'restricted' | 'desired_gains' | 'pure_desired_gains';

export default function OpenIndexGenView() {
  const [availableTraits, setAvailableTraits] = useState<string[]>([]);
  
  // N-Trait Multi-Select State
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [method, setMethod] = useState<MethodType>('restricted');
  const [economicWeights, setEconomicWeights] = useState<Record<string, number>>({});
  const [desiredGains, setDesiredGains] = useState<Record<string, number>>({});
  const [restrictedTraits, setRestrictedTraits] = useState<Record<string, boolean>>({});
  const [alpha, setAlpha] = useState<number>(0.5);
  const cycles = 1;
  
  // Visualization State
  const [showIsoeconomic, setShowIsoeconomic] = useState<boolean>(false);
  const [showHelp, setShowHelp] = useState<boolean>(false);
  
  // Backend Results State
  const [GMatrix, setGMatrix] = useState<number[][] | null>(null);
  const [ellipseDataMap, setEllipseDataMap] = useState<Record<string, {x: number[], y: number[]}>>({});
  const [redDot, setRedDot] = useState<number[] | null>(null);
  const [optimalB, setOptimalB] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 1. Fetch available traits
  useEffect(() => {
    fetch(`${API_BASE}/dataset/traits`)
      .then(r => r.json())
      .then(data => {
        if (data.traits) {
          setAvailableTraits(data.traits);
          // Default to first 4 traits to show off the matrix
          if (data.traits.length >= 4) {
            const initial = data.traits.slice(0, 4);
            setSelectedTraits(initial);
            
            const initW: Record<string, number> = {};
            const initD: Record<string, number> = {};
            const initR: Record<string, boolean> = {};
            initial.forEach((t: string) => {
              initW[t] = 1.0;
              initD[t] = 0.5;
              initR[t] = false;
            });
            setEconomicWeights(initW);
            setDesiredGains(initD);
            setRestrictedTraits(initR);
          }
        }
      })
      .catch(e => setError("Failed to load traits: " + e.message));
  }, []);

  // Handle trait selection toggles
  const handleTraitToggle = (t: string) => {
    setSelectedTraits(prev => {
      let next = [...prev];
      if (next.includes(t)) {
        next = next.filter(x => x !== t);
      } else {
        if (next.length >= 10) return prev; // Limit to 10
        next.push(t);
      }
      
      // Ensure defaults exist
      setEconomicWeights(w => ({ ...w, [t]: w[t] ?? 1.0 }));
      setDesiredGains(d => ({ ...d, [t]: d[t] ?? 0.5 }));
      setRestrictedTraits(r => ({ ...r, [t]: r[t] ?? false }));
      
      return next;
    });
  };

  // 2. Fetch G Matrix and Simulate when N-Trait state changes
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (selectedTraits.length < 2) return;
    
    const runSimulation = async () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      try {
        setError(null);
        // Get G Matrix
        const matRes = await fetch(`${API_BASE}/dataset/matrix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ traits: selectedTraits }),
          signal
        });
        const matData = await matRes.json();
        if (!matRes.ok) throw new Error(matData.detail || "Failed to fetch matrix");
        
        const G = matData.covariance_matrix;
        setGMatrix(G);
        
        // Prepare simulation payload
        const restrictIdx: number[] = [];
        selectedTraits.forEach((t, i) => {
          if (restrictedTraits[t]) restrictIdx.push(i);
        });
        
        let finalMethod = method as string;
        
        // If they chose the standard index but didn't check any restrict boxes, 
        // mathematically it is just an unrestricted index.
        if (method === 'restricted' && restrictIdx.length === 0) {
          finalMethod = 'unrestricted';
        }

        // If they chose Hybrid Desired Gains but didn't check any restrict boxes
        if (method === 'desired_gains' && restrictIdx.length === 0) {
          throw new Error("Hybrid Desired Gains requires at least 1 restricted trait. Please check a 'Restrict' box to set a target.");
        }

        const simPayload: Record<string, unknown> = {
          method: finalMethod,
          P: G, // Using G for P as requested by domain rules
          G: G,
          v: selectedTraits.map(t => economicWeights[t] || 0),
          cycles
        };
        
        if (finalMethod === 'restricted' || finalMethod === 'desired_gains') {
          simPayload.restrict_idx = restrictIdx;
        }
        
        if (finalMethod === 'desired_gains' || finalMethod === 'pure_desired_gains') {
          simPayload.delta = restrictIdx.map(idx => desiredGains[selectedTraits[idx]] || 0);
          if (finalMethod === 'pure_desired_gains') {
            simPayload.delta = selectedTraits.map(t => desiredGains[t] || 0);
          }
          simPayload.alpha_proportion = alpha;
        }

        const simRes = await fetch(`${API_BASE}/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(simPayload),
          signal
        });
        const simData = await simRes.json();
        if (!simRes.ok) throw new Error(simData.detail || simData.message);
        
        setRedDot(simData.predicted_genetic_change as number[]);
        setOptimalB(simData.weights as number[]);
        
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    
    // Use rapid timeout for smooth drag
    const to = setTimeout(runSimulation, 30);
    return () => clearTimeout(to);
  }, [selectedTraits, method, economicWeights, desiredGains, restrictedTraits, alpha, cycles]);

  // 3. Generate Ellipse Map for all pairs
  useEffect(() => {
    if (!GMatrix || selectedTraits.length < 2) return;
    
    fetch(`${API_BASE}/ellipse_module`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ G: GMatrix })
    })
    .then(r => r.json())
    .then(data => {
      if (data.detail) throw new Error(data.detail);
      if (selectedTraits.length === 2) {
        // Special case: backend returned a single dict when N=2
        setEllipseDataMap({ "0_1": data });
      } else {
        setEllipseDataMap(data);
      }
    })
    .catch(e => setError(e.message));
  }, [GMatrix, selectedTraits]);

  // Handle clicking boundary (Reverse Engineer v)
  const handleBoundaryClick = async (idxX: number, idxY: number, clickX: number, clickY: number) => {
    if (!GMatrix) return;
    const G2x2 = [
      [GMatrix[idxX][idxX], GMatrix[idxX][idxY]],
      [GMatrix[idxY][idxX], GMatrix[idxY][idxY]]
    ];
    
    try {
      const revRes = await fetch(`${API_BASE}/ellipse_module`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ G: G2x2, target_x: clickX, target_y: clickY })
      });
      const revData = await revRes.json();
      if (!revRes.ok) throw new Error(revData.detail);
      if (!revData.v || !Array.isArray(revData.v)) return;
      
      const plotX = selectedTraits[idxX];
      const plotY = selectedTraits[idxY];

      setMethod('unrestricted');
      setEconomicWeights(prev => {
        const next = { ...prev };
        selectedTraits.forEach(t => next[t] = 0);
        next[plotX] = revData.v[0] || 0;
        next[plotY] = revData.v[1] || 0;
        return next;
      });
    } catch(e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  // Handle dragging red dot (Pure Desired Gains)
  const handleRedDotDrag = (idxX: number, idxY: number, newX: number, newY: number) => {
    const plotX = selectedTraits[idxX];
    const plotY = selectedTraits[idxY];
    
    setMethod('pure_desired_gains');
    setDesiredGains(prev => {
      const next = { ...prev };
      // Optional: zero out other targets? 
      // The user drag implies they only care about these two targets, but zeroing out forces the others to literally not change (0 gain).
      // We will set others to 0 to keep it consistent with the "snap" behavior.
      selectedTraits.forEach(t => next[t] = 0);
      next[plotX] = newX;
      next[plotY] = newY;
      return next;
    });
  };

  // Generate Matrix Grid
  const renderMatrix = () => {
    const N = selectedTraits.length;
    if (N < 2) return <div style={{ color: 'var(--text-muted)' }}>Select at least 2 traits.</div>;
    if (!redDot || Object.keys(ellipseDataMap).length === 0) return <div>Simulating...</div>;

    const pairs = [];
    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const key = `${i}_${j}`;
        const ellipse = ellipseDataMap[key];
        if (!ellipse) continue;

        pairs.push(
          <InteractiveEllipse
            key={key}
            traitX={selectedTraits[i]}
            traitY={selectedTraits[j]}
            ellipse={ellipse}
            redDot={{ x: redDot[i], y: redDot[j] }}
            vX={economicWeights[selectedTraits[i]] || 0}
            vY={economicWeights[selectedTraits[j]] || 0}
            showIsoeconomic={showIsoeconomic}
            onBoundaryClick={(x, y) => handleBoundaryClick(i, j, x, y)}
            onRedDotDrag={(x, y) => handleRedDotDrag(i, j, x, y)}
          />
        );
      }
    }

    return (
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
        gap: '1rem',
        width: '100%'
      }}>
        {pairs}
      </div>
    );
  };

  return (
    <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', color: 'var(--text-primary)' }}>N-Trait Index & Ellipse Matrix</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Visualize all pairs of traits simultaneously! 
          <br/><strong>Drag the red dot</strong> to smoothly dial in your Desired Gains targets. 
          <br/><strong>Click "Snap to Limits"</strong> to auto-calculate the precise Unrestricted economic weights needed to push your selected direction to its theoretical maximum boundary!
        </p>
        <button onClick={() => setShowHelp(true)} style={{ marginTop: '0.5rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', padding: '0.5rem 1rem', borderRadius: '100px', cursor: 'pointer', border: '1px solid rgba(59, 130, 246, 0.2)', fontSize: '0.85rem' }}>
          <HelpCircle size={16} /> How is the math calculated?
        </button>
      </header>

      {showHelp && (
        <div style={{ padding: '1.5rem', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)', borderRadius: '12px', position: 'relative' }}>
          <button onClick={() => setShowHelp(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={20} /></button>
          <h2 style={{ margin: '0 0 1rem 0', color: '#3b82f6', fontSize: '1.25rem' }}>Index Formula Breakdown</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>1. Net Merit (Unrestricted)</strong><br/>
              The standard Hazel (1943) index. Uses your manual economic weights (v).<br/>
              <code style={{ background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.4rem', borderRadius: '4px', marginTop: '0.5rem', display: 'inline-block' }}>b = P⁻¹ G v</code><br/>
              <code style={{ background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.4rem', borderRadius: '4px', marginTop: '0.2rem', display: 'inline-block' }}>ΔG = (G b) / σᵢ</code>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>2. Restricted Traits (Standard Index)</strong><br/>
              Uses the Kempthorne & Nordskog (1959) approach to force selected traits to have exactly zero genetic change (ΔG = 0).<br/>
              <code style={{ background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.4rem', borderRadius: '4px', marginTop: '0.5rem', display: 'inline-block' }}>b = [I - P⁻¹ G_c (G_cᵀ P⁻¹ G_c)⁻¹ G_cᵀ] P⁻¹ G v</code>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>3. Pure Desired Gains</strong><br/>
              Uses the Brascamp (1984) approach. Ignores economic weights entirely. It derives the exact index weights (b) needed to reach your target delta (δ).<br/>
              <code style={{ background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.4rem', borderRadius: '4px', marginTop: '0.5rem', display: 'inline-block' }}>b = P⁻¹ δ</code>
            </div>
            <div>
              <strong style={{ color: 'var(--text-primary)' }}>4. Hybrid Desired Gains</strong><br/>
              Combines both approaches! It restricts some traits to hit a target (δ) while optimizing the remaining traits using your economic weights (v). The proportion (α) blends the solutions.<br/>
              <code style={{ background: 'rgba(0,0,0,0.2)', padding: '0.2rem 0.4rem', borderRadius: '4px', marginTop: '0.5rem', display: 'inline-block' }}>b = (1 - α) b_unrestricted + α b_desired</code>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid #ef4444', color: '#ef4444' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
        
        {/* LEFT PANEL: Multi-Trait Constraints */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-accent)', margin: '0 0 1rem 0' }}>
              <Database size={18} /> Select Traits
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {availableTraits.map(t => {
                const isActive = selectedTraits.includes(t);
                return (
                  <button 
                    key={t}
                    onClick={() => handleTraitToggle(t)}
                    style={{
                      padding: '0.25rem 0.75rem',
                      borderRadius: '100px',
                      border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--border-light)'}`,
                      background: isActive ? 'rgba(var(--color-accent-rgb), 0.1)' : 'transparent',
                      color: isActive ? 'var(--color-accent)' : 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-accent)', margin: '0 0 1rem 0' }}>
              <Settings size={18} /> Index Paradigm
            </h3>
            
            <select 
              value={method} 
              onChange={e => setMethod(e.target.value as MethodType)}
              style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', borderRadius: '4px', marginBottom: '1rem' }}
            >
              <option value="unrestricted">Net Merit (Unrestricted)</option>
              <option value="restricted">Restricted Traits</option>
              <option value="desired_gains">Hybrid Desired Gains</option>
              <option value="pure_desired_gains">Pure Desired Gains</option>
            </select>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-light)', textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style={{ padding: '0.5rem' }}>Trait</th>
                  {(method === 'restricted' || method === 'desired_gains') && <th style={{ padding: '0.5rem' }}>Restrict</th>}
                  {method !== 'pure_desired_gains' && <th style={{ padding: '0.5rem' }}>$v$</th>}
                  {(method === 'desired_gains' || method === 'pure_desired_gains') && <th style={{ padding: '0.5rem' }}>$\delta$</th>}
                </tr>
              </thead>
              <tbody>
                {selectedTraits.map(t => (
                  <tr key={t} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: '0.5rem', color: 'var(--text-primary)' }}>{t}</td>
                    
                    {(method === 'restricted' || method === 'desired_gains') && (
                      <td style={{ padding: '0.5rem' }}>
                        <input type="checkbox" checked={restrictedTraits[t]} onChange={e => setRestrictedTraits(r => ({ ...r, [t]: e.target.checked }))} />
                      </td>
                    )}
                    
                    {method !== 'pure_desired_gains' && (
                      <td style={{ padding: '0.5rem' }}>
                        <input 
                          type="number" step="0.1" 
                          value={economicWeights[t]} 
                          onChange={e => setEconomicWeights(w => ({ ...w, [t]: parseFloat(e.target.value)||0 }))}
                          style={{ width: '60px', padding: '0.2rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '4px' }} 
                        />
                      </td>
                    )}
                    
                    {(method === 'desired_gains' || method === 'pure_desired_gains') && (
                      <td style={{ padding: '0.5rem' }}>
                        <input 
                          type="number" step="0.1" 
                          value={desiredGains[t]} 
                          onChange={e => setDesiredGains(w => ({ ...w, [t]: parseFloat(e.target.value)||0 }))}
                          style={{ width: '60px', padding: '0.2rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '4px' }}
                          disabled={method === 'desired_gains' && !restrictedTraits[t]}
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {method === 'desired_gains' && (
              <div style={{ marginTop: '1rem' }}>
                <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                  Proportional Allocation ($\alpha$): {alpha.toFixed(2)}
                </label>
                <input 
                  type="range" min="0" max="1" step="0.01" 
                  value={alpha} onChange={e => setAlpha(parseFloat(e.target.value))} 
                  style={{ width: '100%' }}
                />
              </div>
            )}
          </div>

          <div style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '1.5rem', borderRadius: '12px' }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#10b981', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={18} /> Global Index Weights ($b$)
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {selectedTraits.map((t, idx) => (
                  <div key={t} style={{ background: 'rgba(0,0,0,0.1)', padding: '0.5rem', borderRadius: '4px', minWidth: '80px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t}</div>
                    <div style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{optimalB ? optimalB[idx]?.toFixed(4) : '-'}</div>
                  </div>
                ))}
              </div>
          </div>
          
        </div>

        {/* RIGHT PANEL: Ellipse Matrix */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px' }}>
          
          <div style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={showIsoeconomic} onChange={e => setShowIsoeconomic(e.target.checked)} />
              Show Isoeconomic Lines
            </label>
            <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <MousePointerClick size={14} /> Drag red dot or click "Snap to Limits"
            </div>
          </div>

          <div style={{ flex: 1, minHeight: '400px' }}>
            {renderMatrix()}
          </div>
          
        </div>
      </div>
    </div>
  );
}
