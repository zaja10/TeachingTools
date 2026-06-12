import React, { useState } from 'react';
import PlotLib from 'react-plotly.js';
const Plot = (PlotLib as unknown as { default: typeof PlotLib }).default || PlotLib;
import ToolLayoutWrapper from '../../layout/ToolLayoutWrapper';

const BreedersEquationView: React.FC = () => {
  const [runs, setRuns] = useState<Record<string, unknown>[]>([]);
  const [runCounter, setRunCounter] = useState(1);
  const [params, setParams] = useState({
    selectionProportion: 10,
    evaluationMethod: 'phenotypic',
    replications: 1,
    nurserySpeed: 'standard',
    numberOfGenerations: 10
  });

  const [metrics, setMetrics] = useState({
    popMean: 100.0,
    sigmaA: 15.0,
    deltaGPerYear: 0.0
  });

  const calculateGainParams = () => {
    const p = params.selectionProportion / 100;
    const i = p >= 1 ? 0 : 0.8 + (1 - p) * 1.8;
    let r = 0.5;
    if (params.evaluationMethod === 'phenotypic') r = 0.4 + (params.replications * 0.05);
    if (params.evaluationMethod === 'progeny') r = 0.7 + (params.replications * 0.02);
    if (params.evaluationMethod === 'genomic') r = 0.75 + (params.replications * 0.01);
    let L = 1.0;
    if (params.nurserySpeed === 'offseason') L = 0.5;
    if (params.nurserySpeed === 'speedbreeding') L = 0.25;
    if (params.evaluationMethod === 'progeny') L += 1.0;
    
    return { i, r, L };
  };

  const handleRun = () => {
    const { i, r, L } = calculateGainParams();
    let currentYield = 100;
    let currentSigmaA = 15;
    
    const xData = [];
    const yData = [];
    
    // Variance decay: stronger selection intensity (i) causes faster decay of additive genetic variance (Bulmer effect)
    const varianceDecayFactor = 1 - (i * 0.05); 
    
    for (let gen = 0; gen <= params.numberOfGenerations; gen++) {
      xData.push(gen * L); // Plotting by Year
      yData.push(currentYield);
      
      const R = (i * r * currentSigmaA); // Gain per cycle
      currentYield += R;
      currentSigmaA *= varianceDecayFactor; // apply variance decay each cycle
    }

    const totalYears = params.numberOfGenerations * L;
    const finalDeltaG = totalYears > 0 ? (currentYield - 100) / totalYears : 0;

    setMetrics({
      popMean: currentYield,
      sigmaA: currentSigmaA,
      deltaGPerYear: finalDeltaG
    });

    const newRun = {
      name: `Run ${runCounter}`,
      x: xData,
      y: yData,
      mode: 'lines+markers',
      line: { width: 3 }
    };
    setRuns([...runs, newRun]);
    setRunCounter(runCounter + 1);
  };

  const handleClear = () => {
    setRuns([]);
    setRunCounter(1);
    setMetrics({ popMean: 100.0, sigmaA: 15.0, deltaGPerYear: 0.0 });
  };

  return (
    <ToolLayoutWrapper 
      header={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--color-accent)' }}>Breeder's Equation Simulator</h1>
            <p style={{ margin: '0.5rem 0 0', color: 'var(--text-muted)' }}>Optimize your breeding pipeline by balancing intensity, accuracy, variance, and cycle time.</p>
          </div>
        </div>
      }
      controls={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Simulation Controls</h3>
          
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
               <span>Selection Proportion (Intensity)</span>
               <span style={{ color: 'var(--color-accent)' }}>Top {params.selectionProportion}%</span>
            </div>
            <input 
              type="range" min="1" max="100" 
              value={params.selectionProportion} 
              onChange={e => setParams({...params, selectionProportion: parseInt(e.target.value)})} 
              style={{ accentColor: 'var(--color-accent)' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-secondary)' }}>
            Evaluation Method (Accuracy & Time)
            <select 
              value={params.evaluationMethod}
              onChange={e => setParams({...params, evaluationMethod: e.target.value})}
              style={{ padding: '0.5rem', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '4px' }}
            >
              <option value="phenotypic">Phenotypic Selection</option>
              <option value="progeny">Progeny Testing (High Accuracy, +1 Yr)</option>
              <option value="genomic">Genomic Selection (High Accuracy)</option>
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
               <span>Field Replications (Accuracy)</span>
               <span style={{ color: 'var(--color-accent)' }}>{params.replications}</span>
            </div>
            <input 
              type="range" min="1" max="10" 
              value={params.replications} 
              onChange={e => setParams({...params, replications: parseInt(e.target.value)})} 
              style={{ accentColor: 'var(--color-accent)' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-secondary)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
               <span>Number of Generations</span>
               <span style={{ color: 'var(--color-accent)' }}>{params.numberOfGenerations}</span>
            </div>
            <input 
              type="range" min="1" max="50" step="1" 
              value={params.numberOfGenerations} 
              onChange={(e) => setParams({...params, numberOfGenerations: parseInt(e.target.value)})}
              style={{ accentColor: 'var(--color-accent)' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-secondary)' }}>
            Nursery Speed (Cycle Time L)
            <select 
              value={params.nurserySpeed}
              onChange={e => setParams({...params, nurserySpeed: e.target.value})}
              style={{ padding: '0.5rem', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-light)', borderRadius: '4px' }}
            >
              <option value="standard">Standard (1 Gen/Year)</option>
              <option value="offseason">Off-season (2 Gen/Year)</option>
              <option value="speedbreeding">Speed Breeding (4 Gen/Year)</option>
            </select>
          </label>

          <button className="btn-primary" onClick={handleRun} style={{ marginTop: 'auto' }}>
            Run Breeding Cycle
          </button>
        </div>
      }
      canvas={
        <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
            <button onClick={handleClear} style={{ background: 'transparent', border: '1px solid var(--border-light)', color: 'var(--text-secondary)', padding: '0.25rem 0.75rem', borderRadius: '4px', cursor: 'pointer' }}>Clear History</button>
          </div>
          <div style={{ flex: 1, backgroundColor: 'transparent', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <Plot
              data={runs}
              layout={{
                autosize: true,
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                font: { color: '#475569' },
                xaxis: { title: { text: 'Years' }, gridcolor: '#e2e8f0' },
                yaxis: { title: { text: 'Genetic Gain (Yield)' }, gridcolor: '#e2e8f0' },
                margin: { l: 50, r: 20, t: 20, b: 50 },
                showlegend: true,
              }}
              useResizeHandler={true}
              style={{ width: '100%', height: '100%' }}
              config={{ responsive: true, displayModeBar: false }}
            />
          </div>
        </div>
      }
      metrics={
        <div style={{ display: 'flex', justifyContent: 'space-around', color: 'var(--text-secondary)', width: '100%' }}>
          <span>Latest Pop Mean: <strong style={{ color: '#4ade80' }}>{metrics.popMean.toFixed(2)}</strong></span>
          <span>Genetic Variance (σ²g): <strong style={{ color: '#fbbf24' }}>{metrics.sigmaA.toFixed(2)}</strong></span>
          <span>ΔG / Year: <strong style={{ color: '#60a5fa' }}>{metrics.deltaGPerYear.toFixed(2)}</strong></span>
        </div>
      }
    />
  );
};

export default BreedersEquationView;
