import React, { useState } from 'react';
import ToolLayoutWrapper from '../../layout/ToolLayoutWrapper';

const SpatialStrataView: React.FC = () => {
  const [params, setParams] = useState({ gridRows: 10, gridCols: 10 });

  return (
    <ToolLayoutWrapper 
      header={
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#646cff' }}>Spatial Strata Simulator</h1>
          <p style={{ margin: '0.5rem 0 0', color: '#aaa' }}>Configure grid constraints and observe phenotypic variance.</p>
        </div>
      }
      controls={
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h3 style={{ margin: 0, color: '#fff' }}>Parameters</h3>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', color: '#ccc' }}>
            Grid Rows ({params.gridRows})
            <input type="range" min="5" max="50" value={params.gridRows} onChange={e => setParams({...params, gridRows: parseInt(e.target.value)})} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', color: '#ccc' }}>
            Grid Cols ({params.gridCols})
            <input type="range" min="5" max="50" value={params.gridCols} onChange={e => setParams({...params, gridCols: parseInt(e.target.value)})} />
          </label>
          <button style={{ padding: '0.75rem', backgroundColor: '#646cff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', marginTop: '1rem' }}>
            Run Simulation
          </button>
        </div>
      }
      canvas={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#888' }}>
          Canvas for {params.gridRows}x{params.gridCols} spatial field
        </div>
      }
      metrics={
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ccc' }}>
          <span>Estimated Variance: <strong>N/A</strong></span>
          <span>Simulation Time: <strong>0ms</strong></span>
        </div>
      }
    />
  );
};

export default SpatialStrataView;
