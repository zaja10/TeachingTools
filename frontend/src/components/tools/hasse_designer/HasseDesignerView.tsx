import React, { useState, useEffect, useMemo } from 'react';
import ToolLayoutWrapper from '../../layout/ToolLayoutWrapper';

import { HasseGraph as HasseGraphComponent } from './components/HasseGraph';
import { AnovaTable } from './components/AnovaTable';
import { VisualBuilder } from './components/VisualBuilder';
import type { Factor } from './engine/Factor';
import { buildHasseGraph } from './engine/Graph';
import { parseFormula } from './engine/Parser';
import { SCENARIOS } from './engine/Scenarios';
import '@xyflow/react/dist/style.css'; // Ensure React Flow styles are loaded

const HasseDesignerView: React.FC = () => {
  const [activeScenarioId, setActiveScenarioId] = useState<string>('split-plot');
  const activeScenario = SCENARIOS.find(s => s.id === activeScenarioId) || SCENARIOS[0];

  const [factors, setFactors] = useState<Factor[]>(activeScenario.factors);
  const [unitFormula, setUnitFormula] = useState(activeScenario.unitFormula);
  const [treatFormula, setTreatFormula] = useState(activeScenario.treatFormula);
  const [inputMode, setInputMode] = useState<'formula' | 'visual'>('formula');
  const [activeTab, setActiveTab] = useState<'graph' | 'anova'>('graph');
  const [isInputExpanded, setIsInputExpanded] = useState(true);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, { n?: number, df?: number }>>({});

  useEffect(() => {
    // When scenario changes, update local states
    const scenario = SCENARIOS.find(s => s.id === activeScenarioId);
    if (scenario) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFactors(scenario.factors);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setUnitFormula(scenario.unitFormula);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTreatFormula(scenario.treatFormula);
    }
  }, [activeScenarioId]);

  const parsedTerms = useMemo(() => {
    try {
      const uTerms = unitFormula.trim() ? parseFormula(unitFormula, factors) : [];
      const tTerms = treatFormula.trim() ? parseFormula(treatFormula, factors) : [];
      return { unit: uTerms, treat: tTerms };
    } catch (e) {
      console.error(e);
      return null;
    }
  }, [unitFormula, treatFormula, factors]);

  const { uGraph, tGraph, graph } = useMemo(() => {
    if (!parsedTerms) return { uGraph: null, tGraph: null, graph: null };
    
    const uGraphLocal = parsedTerms.unit.length > 0 ? buildHasseGraph(parsedTerms.unit, overrides, 'Unit_Mean') : { nodes: [], edges: [] };
    const tGraphLocal = parsedTerms.treat.length > 0 ? buildHasseGraph(parsedTerms.treat, overrides, 'Treat_Mean') : { nodes: [], edges: [] };

    const uMean = uGraphLocal.nodes.find(n => n.id === 'Unit_Mean');
    if (uMean) { uMean.name = 'Y (Unit)'; }
    const tMean = tGraphLocal.nodes.find(n => n.id === 'Treat_Mean');
    if (tMean) { tMean.name = 'Y (Treat)'; }

    const newGraph = {
      nodes: [...uGraphLocal.nodes, ...tGraphLocal.nodes],
      edges: [...uGraphLocal.edges, ...tGraphLocal.edges]
    };
    
    return { uGraph: uGraphLocal, tGraph: tGraphLocal, graph: newGraph };
  }, [parsedTerms, overrides]);

  const handleOverrideChange = (id: string, key: 'n' | 'df', value: number | undefined) => {
    setOverrides(prev => {
      const next = { ...prev };
      if (!next[id]) next[id] = {};
      if (value === undefined) {
        delete next[id][key];
        if (Object.keys(next[id]).length === 0) delete next[id];
      } else {
        next[id][key] = value;
      }
      return next;
    });
  };

  return (
    <ToolLayoutWrapper
      header={
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', color: 'var(--color-accent)' }}>Hasse Designer & ANOVA Builder</h1>
          <p style={{ margin: '0.5rem 0 0', color: 'var(--text-muted)' }}>Map out complex crossing and nesting relationships to automatically generate skeletal ANOVA tables.</p>
        </div>
      }
      controls={null}
      canvas={
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', overflow: 'hidden' }}>
          
          {/* Horizontal Control Panel for Formula Mode */}
          {inputMode === 'formula' && (
            <div className="glass-panel" style={{ padding: isInputExpanded ? '1rem' : '0', marginBottom: '1rem', flexShrink: 0, transition: 'all 0.3s ease', overflow: 'hidden' }}>
              
              {/* Toggle Header */}
              <div 
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', padding: isInputExpanded ? '0 0 1rem 0' : '1rem', borderBottom: isInputExpanded ? '1px solid var(--border-light)' : 'none' }}
                onClick={() => setIsInputExpanded(!isInputExpanded)}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  ⚙️ Design Configuration
                </div>
                <div style={{ color: 'var(--text-secondary)' }}>
                  {isInputExpanded ? '▲ Collapse' : '▼ Expand'}
                </div>
              </div>

              {/* Collapsible Content */}
              {isInputExpanded && (
                <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem' }}>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Scenario</label>
                    <select className="input" value={activeScenarioId} onChange={(e) => setActiveScenarioId(e.target.value)}>
                      {SCENARIOS.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                    </select>
                    <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={() => setInputMode('visual')}>Switch to Visual Builder</button>
                  </div>

                  <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Unit Structure (Random)</label>
                    <textarea 
                      className="input" 
                      value={unitFormula}
                      onChange={(e) => setUnitFormula(e.target.value)}
                      style={{ minHeight: '40px', fontFamily: 'monospace', padding: '0.25rem 0.5rem' }}
                    />
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: '0.25rem' }}>Treatment Structure (Fixed)</label>
                    <textarea 
                      className="input" 
                      value={treatFormula}
                      onChange={(e) => setTreatFormula(e.target.value)}
                      style={{ minHeight: '40px', fontFamily: 'monospace', padding: '0.25rem 0.5rem' }}
                    />
                  </div>

                  <div style={{ flex: 1.5, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Defined Factors</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', maxHeight: '50px', overflowY: 'auto' }}>
                       {factors.map(f => (
                         <span key={f.id} style={{ background: 'var(--bg-base)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', border: '1px solid var(--border-light)' }}>
                           {f.name} ({f.levels}l, {f.type[0]})
                         </span>
                       ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem', marginTop: 'auto' }}>
                      <input className="input" placeholder="Name" id="factorName" style={{ padding: '0.25rem', fontSize: '0.75rem', width: '60px' }} />
                      <input className="input" type="number" defaultValue={2} id="factorLevels" style={{ padding: '0.25rem', fontSize: '0.75rem', width: '40px' }} />
                      <select className="input" id="factorType" style={{ padding: '0.25rem', fontSize: '0.75rem', width: '60px' }}>
                        <option value="Fixed">Fix</option>
                        <option value="Random">Rnd</option>
                      </select>
                      <button className="btn btn-secondary" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }} onClick={() => {
                        const n = (document.getElementById('factorName') as HTMLInputElement).value;
                        const l = parseInt((document.getElementById('factorLevels') as HTMLInputElement).value);
                        const t = (document.getElementById('factorType') as HTMLSelectElement).value as 'Fixed' | 'Random';
                        if(n) setFactors([...factors, { id: Date.now().toString(), name: n, levels: l, type: t }]);
                      }}>+</button>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                     <button className="btn btn-secondary" onClick={() => { setIsInputExpanded(false); }} style={{ height: '60px', padding: '0 2rem' }}>
                       Generate
                     </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {inputMode === 'visual' ? (
            <div style={{ flex: 1, backgroundColor: 'var(--bg-surface)', borderRadius: 'var(--radius-md)' }}>
              <VisualBuilder onExitVisualMode={() => setInputMode('formula')} />
            </div>
          ) : (
            <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
               <div style={{ display: 'flex', borderBottom: '1px solid var(--border-light)', marginBottom: '1rem' }}>
                 <button 
                   style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: 'none', borderBottom: activeTab === 'graph' ? '2px solid var(--color-accent)' : '2px solid transparent', color: activeTab === 'graph' ? 'var(--color-accent)' : 'var(--text-secondary)', fontWeight: activeTab === 'graph' ? 600 : 400, cursor: 'pointer', transition: 'all 0.2s' }}
                   onClick={() => setActiveTab('graph')}
                 >Hasse Diagram</button>
                 <button 
                   style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: 'none', borderBottom: activeTab === 'anova' ? '2px solid var(--color-accent)' : '2px solid transparent', color: activeTab === 'anova' ? 'var(--color-accent)' : 'var(--text-secondary)', fontWeight: activeTab === 'anova' ? 600 : 400, cursor: 'pointer', transition: 'all 0.2s' }}
                   onClick={() => setActiveTab('anova')}
                 >Skeletal ANOVA Table</button>
               </div>
               
               <div style={{ flex: 1, minHeight: 0, display: activeTab === 'graph' ? 'block' : 'none' }}>
                 <HasseGraphComponent 
                   uGraph={uGraph} 
                   tGraph={tGraph}
                   selectedNodeId={selectedNodeId}
                   onNodeClick={(id) => setSelectedNodeId(id === selectedNodeId ? null : id)}
                 />
               </div>
               <div style={{ flex: 1, overflowY: 'auto', backgroundColor: 'var(--bg-base)', display: activeTab === 'anova' ? 'block' : 'none', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                 <AnovaTable 
                   graph={graph} 
                   overrides={overrides}
                   onOverrideChange={handleOverrideChange}
                   selectedNodeId={selectedNodeId}
                   onRowHover={setSelectedNodeId}
                   onRowClick={(id) => setSelectedNodeId(id === selectedNodeId ? null : id)}
                 />
               </div>
            </div>
          )}
        </div>
      }
      metrics={
        <div style={{ display: 'flex', justifyContent: 'space-around', color: 'var(--text-secondary)' }}>
          <span>Current Scenario: <strong style={{ color: 'var(--color-accent)' }}>{activeScenario.title}</strong></span>
          <span>Input Mode: <strong>{inputMode === 'formula' ? 'Formula (Wilkinson-Rogers)' : 'Visual Builder'}</strong></span>
        </div>
      }
    />
  );
};

export default HasseDesignerView;
