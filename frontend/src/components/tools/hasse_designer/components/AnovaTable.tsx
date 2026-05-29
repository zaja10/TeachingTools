import { useState } from 'react';
import type { HasseGraph as EngineGraph } from '../engine/Graph';

interface AnovaTableProps {
  graph: EngineGraph | null;
  overrides?: Record<string, { n?: number, df?: number }>;
  onOverrideChange?: (id: string, key: 'n' | 'df', value: number | undefined) => void;
  selectedNodeId?: string | null;
  onRowHover?: (id: string | null) => void;
  onRowClick?: (id: string) => void;
}

const EditableCell = ({ value, onChange, placeholder }: { value: number, onChange: (v: number | undefined) => void, placeholder: number }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editVal, setEditVal] = useState(value.toString());

  if (isEditing) {
    return (
      <input 
        autoFocus
        type="number"
        className="input"
        style={{ width: '60px', padding: '0.25rem' }}
        value={editVal}
        onChange={e => setEditVal(e.target.value)}
        onBlur={() => {
          setIsEditing(false);
          const num = parseInt(editVal);
          onChange(isNaN(num) || num === placeholder ? undefined : num);
        }}
        onKeyDown={e => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
      />
    );
  }

  return (
    <span 
      onClick={() => setIsEditing(true)} 
      style={{ cursor: 'pointer', borderBottom: '1px dashed var(--text-muted)' }}
    >
      {value}
    </span>
  );
};

export function AnovaTable({ graph, overrides = {}, onOverrideChange, selectedNodeId, onRowHover, onRowClick }: AnovaTableProps) {
  if (!graph) return null;

  const strata = graph.nodes.filter(n => (n.type === 'Random' || n.type === 'Mean') && n.id !== 'Treat_Mean');
  strata.sort((a, b) => a.n - b.n);

  const fixedNodes = graph.nodes.filter(n => n.type === 'Fixed' && n.id !== 'Treat_Mean');
  const totalUnits = Math.max(...graph.nodes.map(n => n.n), 1);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ fontSize: '1rem', marginBottom: '1rem', color: 'var(--text-primary)' }}>Skeletal ANOVA</h3>
      
      <div style={{ overflowY: 'auto', flex: 1 }}>
        <table className="anova-table">
          <thead>
            <tr>
              <th>Factor (Source of Variation)</th>
              <th>Sample Size (n)</th>
              <th>Degrees of Freedom (df)</th>
            </tr>
          </thead>
          <tbody>
            {/* Unit Factors */}
            <tr>
              <td colSpan={3} style={{ background: 'var(--bg-base)', fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Design Structure (Random)
              </td>
            </tr>
            {strata.map(stratum => (
              <tr 
                key={stratum.id}
                className={selectedNodeId === stratum.id ? 'selected' : ''}
                onMouseEnter={() => onRowHover?.(stratum.id)}
                onMouseLeave={() => onRowHover?.(null)}
                onClick={() => onRowClick?.(stratum.id)}
                style={{ cursor: 'pointer' }}
              >
                <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{stratum.name}</td>
                <td>
                  <EditableCell 
                    value={overrides[stratum.id]?.n ?? stratum.n} 
                    placeholder={stratum.n}
                    onChange={(v) => onOverrideChange?.(stratum.id, 'n', v)}
                  />
                </td>
                <td>
                  <EditableCell 
                    value={overrides[stratum.id]?.df ?? stratum.df} 
                    placeholder={stratum.df}
                    onChange={(v) => onOverrideChange?.(stratum.id, 'df', v)}
                  />
                </td>
              </tr>
            ))}
            
            {/* Treatment Factors */}
            <tr>
              <td colSpan={3} style={{ background: 'var(--bg-base)', fontWeight: 600, fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Treatment Structure (Fixed)
              </td>
            </tr>
            {fixedNodes.map(t => (
              <tr 
                key={t.id}
                className={selectedNodeId === t.id ? 'selected' : ''}
                onMouseEnter={() => onRowHover?.(t.id)}
                onMouseLeave={() => onRowHover?.(null)}
                onClick={() => onRowClick?.(t.id)}
                style={{ cursor: 'pointer' }}
              >
                <td style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{t.name}</td>
                <td>
                  <EditableCell 
                    value={overrides[t.id]?.n ?? t.n} 
                    placeholder={t.n}
                    onChange={(v) => onOverrideChange?.(t.id, 'n', v)}
                  />
                </td>
                <td>
                  <EditableCell 
                    value={overrides[t.id]?.df ?? t.df} 
                    placeholder={t.df}
                    onChange={(v) => onOverrideChange?.(t.id, 'df', v)}
                  />
                </td>
              </tr>
            ))}

            {/* Total */}
            <tr style={{ borderTop: '2px solid var(--border-color)', fontWeight: 600 }}>
              <td>Total</td>
              <td>{totalUnits}</td>
              <td>{totalUnits - 1}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
