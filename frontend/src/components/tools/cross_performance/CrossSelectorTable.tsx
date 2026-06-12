import './CrossSelectorTable.css';
import { useMemo, useState } from 'react';
import type { PredictedCross } from '../../../engine/crossSelector/crossEngine';
import { CrossHasseVisualizer } from './CrossHasseVisualizer';
import { Network } from 'lucide-react';

interface CrossSelectorTableProps {
  crosses: PredictedCross[];
  selectedTraits: string[];
}

export function CrossSelectorTable({ crosses, selectedTraits }: CrossSelectorTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [displayCount, setDisplayCount] = useState(25);
  const [viewMode, setViewMode] = useState<'table' | 'pedigree'>('table');

  const filteredCrosses = useMemo(() => {
    let result = crosses;
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(c => 
        c.parent1.toLowerCase().includes(lower) || 
        c.parent2.toLowerCase().includes(lower)
      );
    }
    return result.slice(0, displayCount);
  }, [crosses, searchTerm, displayCount]);

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', borderRadius: '12px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-light)' }}>
      <div className="cst-style-1">
        <div>
          <h3 className="cst-style-2">Predicted Cross Performance Rankings</h3>
          <p className="cst-style-3">
            Evaluating {crosses.length.toLocaleString()} possible cross combinations against your selection index.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button 
            onClick={() => setViewMode(v => v === 'table' ? 'pedigree' : 'table')} 
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <Network size={16} /> {viewMode === 'table' ? 'View Pedigree (Top 5)' : 'View Table'}
          </button>
          <input 
            type="text"
            placeholder="Filter by Parent ID..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="cst-style-4"
          />
        </div>
      </div>

      {viewMode === 'pedigree' ? (
        <div style={{ marginTop: '1rem' }}>
          <CrossHasseVisualizer crosses={filteredCrosses.slice(0, 5)} />
        </div>
      ) : (
        <>
          <div className="cst-style-5">
        <table className="cst-style-6">
          <thead className="cst-style-7">
            <tr>
              <th className="cst-style-8">Rank</th>
              <th className="cst-style-9">Cross combination (P1 x P2)</th>
              <th className="cst-style-10">Selection Merit</th>
              <th className="cst-style-11">Relative Profit</th>
              {selectedTraits.map(t => <th key={t} className="cst-style-12">Pred. {t}</th>)}
            </tr>
          </thead>
          <tbody>
            {filteredCrosses.map((cross, idx) => (
              <tr key={`${cross.parent1}_${cross.parent2}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: idx < 5 ? 'rgba(251, 191, 36, 0.03)' : 'transparent' }}>
                <td style={{ padding: '0.75rem', fontWeight: 'bold', color: idx < 3 ? '#fbbf24' : 'var(--text-primary)' }}>{idx + 1}</td>
                <td className="cst-style-13">{`${cross.parent1} × ${cross.parent2}`}</td>
                <td className="cst-style-14">{cross.merit.toFixed(3)}</td>
                <td style={{ padding: '0.75rem', color: cross.relativeProfit >= 0 ? '#10b981' : '#ef4444' }}>
                  {cross.relativeProfit >= 0 ? `+${cross.relativeProfit.toFixed(3)}` : cross.relativeProfit.toFixed(3)}
                </td>
                {selectedTraits.map(t => (
                  <td key={t} className="cst-style-15">{cross.traitValues[t]?.toFixed(2)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {crosses.length > displayCount && (
        <button 
          onClick={() => setDisplayCount(prev => prev + 25)}
          className="cst-style-16"
        >
          Show More Cross Combinations
        </button>
      )}
        </>
      )}
    </div>
  );
}
