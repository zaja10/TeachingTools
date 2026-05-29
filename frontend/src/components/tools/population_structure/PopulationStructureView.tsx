import React from 'react';
import ToolLayoutWrapper from '../../layout/ToolLayoutWrapper';

const PopulationStructureView: React.FC = () => {
  return (
    <ToolLayoutWrapper 
      header={
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#646cff' }}>Population Structure Analysis</h1>
          <p style={{ margin: '0.5rem 0 0', color: '#aaa' }}>Analyze subpopulations and admixture.</p>
        </div>
      }
      controls={<div style={{ color: '#ccc' }}>Controls coming soon...</div>}
      canvas={<div style={{ color: '#888', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>Canvas coming soon...</div>}
      metrics={<div style={{ color: '#ccc' }}>Metrics coming soon...</div>}
    />
  );
};

export default PopulationStructureView;
