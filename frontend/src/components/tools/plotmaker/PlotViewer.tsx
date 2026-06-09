import React from 'react';
import Plot from 'react-plotly.js';

interface PlotViewerProps {
  data: any[];
  layout: any;
  title?: string;
  config?: any;
}

const PlotViewer: React.FC<PlotViewerProps> = ({ data, layout, title, config }) => {
  return (
    <div className="plot-container" style={{ display: 'flex', flexDirection: 'column', width: '100%', flex: 1, minHeight: '400px' }}>
      {title && <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)', flexShrink: 0 }}>{title}</h3>}
      <div style={{ flex: 1, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <Plot
        data={data}
        layout={{
          autosize: true,
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          font: { color: 'var(--text-primary)' },
          xaxis: { gridcolor: 'rgba(255,255,255,0.1)', zerolinecolor: 'rgba(255,255,255,0.2)' },
          yaxis: { gridcolor: 'rgba(255,255,255,0.1)', zerolinecolor: 'rgba(255,255,255,0.2)' },
          margin: { l: 50, r: 20, t: 30, b: 50 },
          ...layout
        }}
        useResizeHandler={true}
        style={{ width: '100%', height: '100%' }}
            config={{ displayModeBar: true, responsive: true, ...config }}
          />
        </div>
      </div>
    </div>
  );
};

export default PlotViewer;
