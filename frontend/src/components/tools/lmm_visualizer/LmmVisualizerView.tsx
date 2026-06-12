import React, { useState } from 'react';
import PlotLib from 'react-plotly.js';
const Plot = (PlotLib as unknown as { default: typeof PlotLib }).default || PlotLib;
import ToolLayoutWrapper from '../../layout/ToolLayoutWrapper';

import lmmStaticData from '../../../utils/lmmData.json';

const LmmVisualizerView: React.FC = () => {
  const [data] = useState<typeof lmmStaticData>(lmmStaticData);
  
  const [modelTerms, setModelTerms] = useState({
    genotype: 'none',
    environment: 'none',
    gxe: 'none'
  });

  const generateEquation = () => {
    const terms = [];
    terms.push(<span key="mu">μ</span>);
    
    if (modelTerms.genotype === 'fixed') terms.push(<span key="g_f">G<sub>fixed</sub></span>);
    if (modelTerms.genotype === 'random') terms.push(<span key="g_r">u<sub>G</sub></span>);
    
    if (modelTerms.environment === 'fixed') terms.push(<span key="e_f">E<sub>fixed</sub></span>);
    if (modelTerms.environment === 'random') terms.push(<span key="e_r">u<sub>E</sub></span>);
    
    if (modelTerms.gxe === 'fixed') terms.push(<span key="gxe_f">(G × E)<sub>fixed</sub></span>);
    if (modelTerms.gxe === 'random') terms.push(<span key="gxe_r">u<sub>G × E</sub></span>);
    
    terms.push(<span key="e">e</span>);

    return (
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', fontStyle: 'italic', letterSpacing: '0.05em' }}>
        <span>y</span>
        <span>=</span>
        {terms.map((term, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span>+</span>}
            {term}
          </React.Fragment>
        ))}
      </div>
    );
  };

  const renderPlotlyData = () => {
    if (!data) return [];
    
    const traces: Record<string, unknown>[] = [];
    const colors = { "Genotype 1": "#3b82f6", "Genotype 2": "#f97316", "Genotype 3": "#22c55e", "Genotype 4": "#a855f7" };
    const genotypes = ["Genotype 1", "Genotype 2", "Genotype 3", "Genotype 4"];
    const environments = ["Env 1", "Env 2", "Env 3"];
    
    genotypes.forEach(geno => {
      const gPoints = data.points.filter(p => p.genotype === geno);
      
      // Add slight random jitter to x for visibility of raw points
      const jitteredX = gPoints.map(p => {
          const baseIndex = environments.indexOf(p.env);
          return environments[baseIndex]; 
      });

      traces.push({
        x: jitteredX,
        y: gPoints.map(p => p.y),
        mode: 'markers',
        type: 'scatter',
        name: `${geno} (Raw)`,
        marker: { color: colors[geno as keyof typeof colors], size: 5, opacity: 0.2 },
        showlegend: false
      });
    });

    // Predicted lines
    genotypes.forEach(geno => {
       const yVals = environments.map(env => {
           let pred = data.components.mu;
           if (modelTerms.genotype === 'fixed') pred += data.components.G_fixed[geno as keyof typeof data.components.G_fixed];
           if (modelTerms.genotype === 'random') pred += data.components.G_random[geno as keyof typeof data.components.G_random];
           if (modelTerms.environment === 'fixed') pred += data.components.E_fixed[env as keyof typeof data.components.E_fixed];
           if (modelTerms.environment === 'random') pred += data.components.E_random[env as keyof typeof data.components.E_random];
           if (modelTerms.gxe === 'fixed') pred += data.components.GxE_fixed[geno as keyof typeof data.components.GxE_fixed][env as keyof typeof data.components.GxE_fixed[keyof typeof data.components.GxE_fixed]];
           if (modelTerms.gxe === 'random') pred += data.components.GxE_random[geno as keyof typeof data.components.GxE_random][env as keyof typeof data.components.GxE_random[keyof typeof data.components.GxE_random]];
           return pred;
       });
       
       const isRandomG = modelTerms.genotype === 'random';
       const isRandomE = modelTerms.environment === 'random';
       
       traces.push({
           x: environments,
           y: yVals,
           mode: 'lines+markers',
           name: geno,
           line: { 
             color: colors[geno as keyof typeof colors], 
             width: 3, 
             dash: (isRandomG || isRandomE) ? 'dot' : 'solid' 
           },
           marker: { size: 10, color: colors[geno as keyof typeof colors] }
       });
    });

    return traces;
  };

  const computeMetrics = () => {
    if (!data) return { totalVar: "0.00", modelVar: "0.00", residualVar: "0.00", r2: "0.0" };
    
    const yAll = data.points.map(p => p.y);
    const meanY = yAll.reduce((a: number, b: number) => a + b, 0) / yAll.length;
    const sst = yAll.reduce((sum: number, y: number) => sum + Math.pow(y - meanY, 2), 0);
    const totalVar = sst / (yAll.length - 1);
    
    const yHat: number[] = [];
    data.points.forEach(p => {
        let pred = data.components.mu;
        if (modelTerms.genotype === 'fixed') pred += data.components.G_fixed[p.genotype as keyof typeof data.components.G_fixed];
        if (modelTerms.genotype === 'random') pred += data.components.G_random[p.genotype as keyof typeof data.components.G_random];
        if (modelTerms.environment === 'fixed') pred += data.components.E_fixed[p.env as keyof typeof data.components.E_fixed];
        if (modelTerms.environment === 'random') pred += data.components.E_random[p.env as keyof typeof data.components.E_random];
        if (modelTerms.gxe === 'fixed') pred += data.components.GxE_fixed[p.genotype as keyof typeof data.components.GxE_fixed][p.env as keyof typeof data.components.GxE_fixed[keyof typeof data.components.GxE_fixed]];
        if (modelTerms.gxe === 'random') pred += data.components.GxE_random[p.genotype as keyof typeof data.components.GxE_random][p.env as keyof typeof data.components.GxE_random[keyof typeof data.components.GxE_random]];
        yHat.push(pred);
    });

    const sse = data.points.reduce((sum: number, p, i: number) => sum + Math.pow(p.y - yHat[i], 2), 0);
    const residualVar = sse / (yAll.length - 1);
    const modelVar = totalVar - residualVar;
    const r2 = (totalVar - residualVar) / totalVar * 100;

    return { 
        totalVar: totalVar.toFixed(2), 
        modelVar: Math.max(0, modelVar).toFixed(2), 
        residualVar: Math.max(0, residualVar).toFixed(2), 
        r2: r2.toFixed(1) 
    };
  };

  const metrics = computeMetrics();

  return (
    <ToolLayoutWrapper 
      header={
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--color-accent)' }}>Linear Mixed Model Visualizer</h1>
          <p style={{ margin: '0.5rem 0 0', color: 'var(--text-muted)' }}>Build your Multi-Environment Trial (MET) model to visualize BLUPs, BLUEs, and Shrinkage.</p>
        </div>
      }
      controls={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%' }}>
          <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Model Builder</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Genotype (G) Effect
              <select value={modelTerms.genotype} onChange={(e) => setModelTerms({...modelTerms, genotype: e.target.value})}>
                <option value="none">Ignore (Grand Mean)</option>
                <option value="fixed">Fixed Effect (BLUEs)</option>
                <option value="random">Random Effect (BLUPs - Shrunken)</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              Environment (E) Effect
              <select value={modelTerms.environment} onChange={(e) => setModelTerms({...modelTerms, environment: e.target.value})}>
                <option value="none">Ignore</option>
                <option value="fixed">Fixed Effect</option>
                <option value="random">Random Effect (Shrunken)</option>
              </select>
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              GxE Interaction
              <select value={modelTerms.gxe} onChange={(e) => setModelTerms({...modelTerms, gxe: e.target.value})}>
                <option value="none">Ignore</option>
                <option value="fixed">Fixed Effect (Cell Means)</option>
                <option value="random">Random Effect (Shrunken Crossover)</option>
              </select>
            </label>
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ padding: '1.25rem', background: 'var(--bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-focus)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Equation View</div>
              <div style={{ fontSize: '1.2rem', color: 'var(--color-accent)' }}>
                {generateEquation()}
              </div>
            </div>

            <div style={{ padding: '1rem', background: 'var(--bg-base)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Variance Partitioning</div>
              <table style={{ width: '100%', fontSize: '0.9rem', color: 'var(--text-secondary)', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '4px 0' }}>Total Phenotypic Var</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{metrics.totalVar}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '4px 0', color: 'var(--color-accent)' }}>Explained (Model)</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', color: 'var(--color-accent)' }}>{metrics.modelVar}</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                    <td style={{ padding: '4px 0', color: '#f43f5e' }}>Residual (Error)</td>
                    <td style={{ textAlign: 'right', fontFamily: 'monospace', color: '#f43f5e' }}>{metrics.residualVar}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 0 0', fontWeight: 'bold' }}>Model R²</td>
                    <td style={{ textAlign: 'right', padding: '8px 0 0', fontWeight: 'bold', fontFamily: 'monospace' }}>{metrics.r2}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      }
      canvas={
        <div style={{ height: '100%', width: '100%', backgroundColor: 'transparent' }}>
          {!data ? (
            <div style={{ color: 'var(--text-muted)', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
              Loading synthetic data from backend...
            </div>
          ) : (
            <Plot
              data={renderPlotlyData()}
              layout={{
                autosize: true,
                paper_bgcolor: 'rgba(0,0,0,0)',
                plot_bgcolor: 'rgba(0,0,0,0)',
                font: { color: '#475569' },
                xaxis: { title: { text: 'Environments' }, gridcolor: '#e2e8f0', type: 'category' },
                yaxis: { title: { text: 'Phenotypic Value' }, gridcolor: '#e2e8f0' },
                margin: { l: 50, r: 20, t: 20, b: 50 },
                showlegend: true,
                legend: { x: 1.05, y: 1 }
              }}
              useResizeHandler={true}
              style={{ width: '100%', height: '100%' }}
              config={{ responsive: true, displayModeBar: false }}
            />
          )}
        </div>
      }
      metrics={
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
          <span>Total Observations: <strong>{data ? data.points.length : 0}</strong></span>
          <span>Data Type: <strong style={{ color: '#3b82f6' }}>Balanced Factorial (4 Genotypes × 3 Environments)</strong></span>
        </div>
      }
    />
  );
};

export default LmmVisualizerView;
