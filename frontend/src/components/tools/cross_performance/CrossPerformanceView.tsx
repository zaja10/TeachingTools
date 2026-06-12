import { useState, useEffect, useRef } from 'react';
import { Network, RefreshCw } from 'lucide-react';
import ToolLayoutWrapper from '../../layout/ToolLayoutWrapper';
import { useIndexContext } from '../../../context/IndexContext';
import { CrossSelectorTable } from './CrossSelectorTable';
import type { PredictedCross } from '../../../engine/crossSelector/crossEngine';

export default function CrossPerformanceView() {
  const { activeExport } = useIndexContext();
  
  const [crossRankings, setCrossRankings] = useState<PredictedCross[]>([]);
  const [isCalculatingCrosses, setIsCalculatingCrosses] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL('../../../engine/crossSelector/crossWorker.ts', import.meta.url), { type: 'module' });
    
    workerRef.current.onmessage = (e) => {
      if (e.data.success) {
        setCrossRankings(e.data.crosses);
      } else {
        console.error("Worker error:", e.data.error);
      }
      setIsCalculatingCrosses(false);
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    if (!activeExport || !activeExport.optimalB || activeExport.selectedTraits.length < 2) {
      setCrossRankings([]);
      return;
    }
    
    const { fullData, selectedTraits, optimalB, lineNames } = activeExport;
    
    setIsCalculatingCrosses(true);
    const names = lineNames.length > 0 
      ? lineNames 
      : Array.from({length: fullData[selectedTraits[0]]?.length || 0}, (_, i) => `Line_${i+1}`);
      
    workerRef.current?.postMessage({
      fullData,
      selectedTraits,
      optimalB,
      lineNames: names
    });
  }, [activeExport]);

  return (
    <ToolLayoutWrapper
      header={
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Predicted Cross Performance</h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Evaluate all possible crosses against your imported selection index weights.
          </p>
        </div>
      }
      controls={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Network size={16} /> Active Index Import
            </h3>
            {activeExport ? (
              <div style={{ fontSize: '0.9rem' }}>
                <p><strong>Source Tool:</strong> {activeExport.sourceTool}</p>
                <p><strong>Dataset:</strong> {activeExport.datasetName}</p>
                <p><strong>Traits:</strong> {activeExport.selectedTraits.join(', ')}</p>
              </div>
            ) : (
              <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                No active index. Go to a Selection Index tool and export an index to see cross predictions.
              </div>
            )}
          </div>
        </div>
      }
      canvas={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%', overflowY: 'auto' }}>
          {isCalculatingCrosses && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-accent)', padding: '1rem' }}>
              <RefreshCw className="spin" size={16} /> Calculating cross rankings...
            </div>
          )}
          {crossRankings.length > 0 && !isCalculatingCrosses && (
            <CrossSelectorTable 
              crosses={crossRankings} 
              selectedTraits={activeExport!.selectedTraits} 
            />
          )}
          {(!activeExport) && !isCalculatingCrosses && (
             <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
               Use the Selection Index Generator or Net Merit Optimizer to define an index, then click "Export to Cross Performance" to view rankings.
             </div>
          )}
        </div>
      }
      metrics={null}
    />
  );
}
