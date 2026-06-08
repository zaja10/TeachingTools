import { useState, useEffect } from 'react';
import PlotlyChart from 'react-plotly.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Plot = (PlotlyChart as any).default || PlotlyChart;
import { Database, MousePointerClick, Settings, Activity } from 'lucide-react';

const API_BASE = 'http://127.0.0.1:8000/api/v1/tools/open_index_gen';

type MethodType = 'unrestricted' | 'restricted' | 'desired_gains' | 'pure_desired_gains';

export default function OpenIndexGenView() {
  const [availableTraits, setAvailableTraits] = useState<string[]>([]);
  
  // N-Trait Multi-Select State
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [method, setMethod] = useState<MethodType>('unrestricted');
  const [economicWeights, setEconomicWeights] = useState<Record<string, number>>({});
  const [desiredGains, setDesiredGains] = useState<Record<string, number>>({});
  const [restrictedTraits, setRestrictedTraits] = useState<Record<string, boolean>>({});
  const [alpha, setAlpha] = useState<number>(0.5);
  const cycles = 1;
  
  // 2D Plot Projection State
  const [plotX, setPlotX] = useState<string>('');
  const [plotY, setPlotY] = useState<string>('');
  const [showIsoeconomic, setShowIsoeconomic] = useState<boolean>(false);
  
  // Backend Results State
  const [GMatrix, setGMatrix] = useState<number[][] | null>(null);
  const [ellipseData, setEllipseData] = useState<{x: number[], y: number[]} | null>(null);
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
          // Default to first 2 traits
          if (data.traits.length >= 2) {
            const initial = [data.traits[0], data.traits[1]];
            setSelectedTraits(initial);
            setPlotX(initial[0]);
            setPlotY(initial[1]);
            
            const initW: Record<string, number> = {};
            const initD: Record<string, number> = {};
            const initR: Record<string, boolean> = {};
            initial.forEach(t => {
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
      
      // Auto-assign plots if empty
      if (next.length > 0 && !next.includes(plotX)) setPlotX(next[0]);
      if (next.length > 1 && !next.includes(plotY)) setPlotY(next[1]);
      
      return next;
    });
  };

  // 2. Fetch G Matrix and Simulate when N-Trait state changes
  useEffect(() => {
    if (selectedTraits.length < 2) return;
    
    const runSimulation = async () => {
      try {
        setError(null);
        // Get G Matrix
        const matRes = await fetch(`${API_BASE}/dataset/matrix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ traits: selectedTraits })
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
        
        const simPayload: Record<string, unknown> = {
          method,
          P: G, // Using G for P as requested by domain rules
          G: G,
          v: selectedTraits.map(t => economicWeights[t] || 0),
          cycles
        };
        
        if (method === 'restricted' || method === 'desired_gains') {
          simPayload.restrict_idx = restrictIdx;
        }
        
        if (method === 'desired_gains' || method === 'pure_desired_gains') {
          simPayload.delta = restrictIdx.map(idx => desiredGains[selectedTraits[idx]] || 0);
          if (method === 'pure_desired_gains') {
            simPayload.delta = selectedTraits.map(t => desiredGains[t] || 0);
          }
          simPayload.alpha_proportion = alpha;
        }

        const simRes = await fetch(`${API_BASE}/simulate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(simPayload)
        });
        const simData = await simRes.json();
        if (!simRes.ok) throw new Error(simData.detail || simData.message);
        
        setRedDot(simData.predicted_genetic_change as number[]);
        setOptimalB(simData.weights as number[]);
        
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    
    // Use timeout to debounce rapid input
    const to = setTimeout(runSimulation, 200);
    return () => clearTimeout(to);
  }, [selectedTraits, method, economicWeights, desiredGains, restrictedTraits, alpha, cycles]);

  // 3. Generate 2D Ellipse for the chosen Plot X and Plot Y
  useEffect(() => {
    if (!GMatrix || selectedTraits.length < 2 || !plotX || !plotY || plotX === plotY) return;
    
    const idxX = selectedTraits.indexOf(plotX);
    const idxY = selectedTraits.indexOf(plotY);
    if (idxX === -1 || idxY === -1) return;
    
    // Extract 2x2 submatrix
    const G2x2 = [
      [GMatrix[idxX][idxX], GMatrix[idxX][idxY]],
      [GMatrix[idxY][idxX], GMatrix[idxY][idxY]]
    ];
    
    fetch(`${API_BASE}/ellipse_module`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ G: G2x2 })
    })
    .then(r => r.json())
    .then(data => {
      if (data.detail) throw new Error(data.detail);
      setEllipseData(data);
    })
    .catch(e => setError(e.message));
  }, [GMatrix, selectedTraits, plotX, plotY]);

  // 4. Handle Interactive Click on 2D Ellipse
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePlotClick = async (event: any) => {
    if (!event.points || event.points.length === 0 || !GMatrix) return;
    const traceName = event.points[0].data.name;
    if (traceName !== 'Limits Ellipse') return;
    
    const clickX = event.points[0].x;
    const clickY = event.points[0].y;
    
    if (typeof clickX !== 'number' || typeof clickY !== 'number') return;
    
    const idxX = selectedTraits.indexOf(plotX);
    const idxY = selectedTraits.indexOf(plotY);
    if (idxX === -1 || idxY === -1) return;
    
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
      if (!revData.v || !Array.isArray(revData.v)) return; // Safety guard
      
      // Snap to unrestricted to apply pure economic weights
      setMethod('unrestricted');
      
      // Update weights: target traits get the calculated weights, ALL OTHER TRAITS BECOME 0
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

  // Build Plot Data
  const plotData: Array<Record<string, unknown>> = [];
  
  const idxX = selectedTraits.indexOf(plotX);
  const idxY = selectedTraits.indexOf(plotY);
  
  if (ellipseData && redDot && idxX !== -1 && idxY !== -1) {
    // Yellow Ellipse
    plotData.push({
      x: ellipseData.x,
      y: ellipseData.y,
      type: 'scatter',
      mode: 'lines',
      name: 'Limits Ellipse',
      line: { color: '#fbbf24', width: 3 },
      fill: 'toself',
      fillcolor: 'rgba(251, 191, 36, 0.05)'
    });
    
    const currentX = redDot[idxX];
    const currentY = redDot[idxY];
    
    // Isoeconomic Line
    if (showIsoeconomic) {
      const vX = economicWeights[plotX] || 0;
      const vY = economicWeights[plotY] || 0;
      
      if (vX !== 0 || vY !== 0) {
        const H = vX * currentX + vY * currentY;
        const minX = Math.min(...ellipseData.x) * 1.5;
        const maxX = Math.max(...ellipseData.x) * 1.5;
        
        const lineX = [minX, maxX];
        const lineY = [
          vY !== 0 ? (H - vX * minX) / vY : (Math.min(...ellipseData.y) * 1.5),
          vY !== 0 ? (H - vX * maxX) / vY : (Math.max(...ellipseData.y) * 1.5)
        ];
        
        if (vY === 0) {
          lineX[0] = H / vX;
          lineX[1] = H / vX;
        }
        
        plotData.push({
          x: lineX,
          y: lineY,
          type: 'scatter',
          mode: 'lines',
          name: 'Isoeconomic Line',
          line: { color: '#64748b', width: 2, dash: 'dot' },
          hoverinfo: 'none'
        });
      }
    }

    // Origin
    plotData.push({
      x: [0], y: [0], type: 'scatter', mode: 'markers', name: 'Origin', marker: { size: 10, symbol: 'cross', color: '#94a3b8' }, hoverinfo: 'none'
    });
    
    // Current Red Dot
    plotData.push({
      x: [currentX],
      y: [currentY],
      type: 'scatter',
      mode: 'markers',
      name: 'Current Response',
      marker: { size: 14, color: '#ef4444', line: { color: 'white', width: 2 } },
      hoverinfo: 'x+y'
    });
  }

  return (
    <div className="glass-panel" style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <header style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem' }}>
        <h1 style={{ margin: 0, fontSize: '2rem', color: 'var(--text-primary)' }}>N-Trait Index & Ellipse Selection</h1>
        <p style={{ color: 'var(--text-muted)' }}>Configure up to 10 traits across different index paradigms. Project any two traits onto the geometric Ellipse plot. <br/><strong>Click the yellow ellipse</strong> to auto-snap your economic weights to maximize gains for those two projected traits.</p>
      </header>

      {error && (
        <div style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '4px solid #ef4444', color: '#ef4444' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        
        {/* LEFT PANEL: Multi-Trait Constraints */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-accent)', margin: '0 0 1rem 0' }}>
              <Database size={18} /> Select Traits (Up to 10)
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
                  {method !== 'pure_desired_gains' && <th style={{ padding: '0.5rem' }}>Weight ($v$)</th>}
                  {(method === 'desired_gains' || method === 'pure_desired_gains') && <th style={{ padding: '0.5rem' }}>Target ($\delta$)</th>}
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
                          style={{ width: '80px', padding: '0.2rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '4px' }} 
                        />
                      </td>
                    )}
                    
                    {(method === 'desired_gains' || method === 'pure_desired_gains') && (
                      <td style={{ padding: '0.5rem' }}>
                        <input 
                          type="number" step="0.1" 
                          value={desiredGains[t]} 
                          onChange={e => setDesiredGains(w => ({ ...w, [t]: parseFloat(e.target.value)||0 }))}
                          style={{ width: '80px', padding: '0.2rem', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '4px' }}
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
                  <div key={t} style={{ background: 'rgba(0,0,0,0.1)', padding: '0.5rem', borderRadius: '4px', minWidth: '100px' }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t}</div>
                    <div style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{optimalB ? optimalB[idx]?.toFixed(4) : '-'}</div>
                  </div>
                ))}
              </div>
          </div>
          
        </div>

        {/* RIGHT PANEL: Ellipse Plot */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', background: 'rgba(255,255,255,0.02)', padding: '1.5rem', borderRadius: '12px' }}>
          
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
             <label style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem', color: 'var(--text-muted)' }}>Project X-Axis</div>
                <select 
                  value={plotX} onChange={e => setPlotX(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', borderRadius: '4px' }}
                >
                  {selectedTraits.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
             </label>
             <label style={{ flex: 1 }}>
                <div style={{ fontSize: '0.85rem', marginBottom: '0.25rem', color: 'var(--text-muted)' }}>Project Y-Axis</div>
                <select 
                  value={plotY} onChange={e => setPlotY(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-card)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', borderRadius: '4px' }}
                >
                  {selectedTraits.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
             </label>
          </div>
          
          {plotX === plotY && selectedTraits.length > 1 && (
            <div style={{ fontSize: '0.8rem', color: '#ef4444' }}>Please select two different traits to project.</div>
          )}

          <div style={{ flex: 1, minHeight: '400px', position: 'relative' }}>
            {selectedTraits.length < 2 ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                Select at least 2 traits.
              </div>
            ) : (
              <Plot
                data={plotData}
                layout={{
                  autosize: true,
                  margin: { t: 20, r: 20, b: 50, l: 50 },
                  paper_bgcolor: 'transparent',
                  plot_bgcolor: 'transparent',
                  font: { color: 'var(--text-primary)' },
                  showlegend: true,
                  legend: { orientation: 'h', y: -0.2 },
                  xaxis: { title: { text: `Response in ${plotX}` }, gridcolor: 'var(--border-light)', zerolinecolor: 'rgba(148, 163, 184, 0.5)' },
                  yaxis: { title: { text: `Response in ${plotY}` }, gridcolor: 'var(--border-light)', zerolinecolor: 'rgba(148, 163, 184, 0.5)' },
                  hovermode: 'closest'
                }}
                onClick={handlePlotClick}
                useResizeHandler={true}
                style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
              />
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1rem', display: 'flex', gap: '2rem', fontSize: '0.85rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
              <input type="checkbox" checked={showIsoeconomic} onChange={e => setShowIsoeconomic(e.target.checked)} />
              Show Isoeconomic Lines
            </label>
            <div style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <MousePointerClick size={14} /> Click boundary to auto-calc weights!
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
