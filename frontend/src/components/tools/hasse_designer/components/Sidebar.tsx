import { useState } from 'react';
import type { Factor, FactorType } from '../engine/Factor';
import { v4 as uuidv4 } from 'uuid';
import { SCENARIOS, type Scenario } from '../engine/Scenarios';

interface SidebarProps {
  factors: Factor[];
  onAddFactor: (factor: Factor) => void;
  onRemoveFactor: (id: string) => void;
  unitFormula: string;
  onUnitFormulaChange: (formula: string) => void;
  treatFormula: string;
  onTreatFormulaChange: (formula: string) => void;
  onApplyFormula: () => void;
  activeScenarioId: string;
  onScenarioChange: (id: string) => void;
  inputMode: 'formula' | 'visual';
  onInputModeChange: (mode: 'formula' | 'visual') => void;
  activeScenario: Scenario;
}

export function Sidebar({ 
  factors, onAddFactor, onRemoveFactor, 
  unitFormula, onUnitFormulaChange, 
  treatFormula, onTreatFormulaChange, 
  onApplyFormula,
  activeScenarioId, onScenarioChange,
  inputMode, onInputModeChange,
  activeScenario
}: SidebarProps) {
  const [name, setName] = useState('');
  const [levels, setLevels] = useState(2);
  const [type, setType] = useState<FactorType>('Fixed');

  const handleAdd = () => {
    if (name.trim() === '') return;
    onAddFactor({
      id: uuidv4(),
      name: name.trim(),
      levels,
      type
    });
    setName('');
    setLevels(2);
  };

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h2 className="gradient-text" style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Hasse Designer</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Experimental Design Algebra</p>
      </div>

      <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>Scenario</h3>
        <select 
          className="input" 
          value={activeScenarioId} 
          onChange={(e) => onScenarioChange(e.target.value)}
        >
          {SCENARIOS.map(s => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--bg-base)', padding: '0.5rem', borderRadius: '4px' }}>
          {activeScenario.description}
        </p>
      </div>

      <div className="glass-panel" style={{ padding: '0.5rem', display: 'flex', gap: '0.5rem', background: 'var(--bg-surface)' }}>
        <button 
          className={`btn ${inputMode === 'formula' ? 'btn-primary' : 'btn-secondary'}`} 
          style={{ flex: 1, padding: '0.25rem 0' }}
          onClick={() => onInputModeChange('formula')}
        >
          Formula Mode
        </button>
        <button 
          className={`btn ${inputMode === 'visual' ? 'btn-primary' : 'btn-secondary'}`} 
          style={{ flex: 1, padding: '0.25rem 0' }}
          onClick={() => onInputModeChange('visual')}
        >
          Visual Builder
        </button>
      </div>

      {inputMode === 'formula' && (
        <>
          <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>1. Define Factors</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Name</label>
          <input 
            className="input" 
            placeholder="e.g. Genotype" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Levels</label>
            <input 
              type="number"
              className="input" 
              min={2}
              value={levels} 
              onChange={(e) => setLevels(parseInt(e.target.value) || 2)} 
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Type</label>
            <select 
              className="input"
              value={type}
              onChange={(e) => setType(e.target.value as FactorType)}
            >
              <option value="Fixed">Fixed</option>
              <option value="Random">Random</option>
            </select>
          </div>
        </div>

        <button className="btn btn-primary" onClick={handleAdd} style={{ width: '100%', marginTop: '0.5rem' }}>
          Add Factor
        </button>

        {factors.length > 0 && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Available Factors:</h4>
            {factors.map(f => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem', background: 'rgba(0,0,0,0.03)', borderRadius: 'var(--radius-md)' }}>
                <div>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{f.name}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>{f.levels} lvls ({f.type})</span>
                </div>
                <button onClick={() => onRemoveFactor(f.id)} style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '1rem' }}>&times;</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <h3 style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>2. Build Design</h3>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Unit Structure (Random)</label>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Physical units and restrictions. e.g. <code>GH/Bench/Pot * Time</code></p>
          <textarea 
            className="input" 
            placeholder="e.g. Block/Plot" 
            value={unitFormula}
            onChange={(e) => onUnitFormulaChange(e.target.value)}
            style={{ minHeight: '60px', fontFamily: 'monospace' }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <label style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Treatment Structure (Fixed)</label>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>The applied treatments. e.g. <code>Genotype * Fertilizer</code></p>
          <textarea 
            className="input" 
            placeholder="e.g. Genotype" 
            value={treatFormula}
            onChange={(e) => onTreatFormulaChange(e.target.value)}
            style={{ minHeight: '60px', fontFamily: 'monospace' }}
          />
        </div>

          <button className="btn btn-secondary" onClick={onApplyFormula} style={{ width: '100%' }}>
            Generate Design
          </button>
        </div>
      </>
      )}

    </div>
  );
}
