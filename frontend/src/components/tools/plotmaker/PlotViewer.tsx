import React, { useEffect, useRef } from 'react';
// @ts-expect-error Types are not available for plotly.js-dist-min
import Plotly from 'plotly.js-dist-min';

interface PlotViewerProps {
  data: Record<string, unknown>[];
  layout: Record<string, unknown>;
  title?: string;
  config?: Record<string, unknown>;
}

const PlotViewer: React.FC<PlotViewerProps> = ({ data, layout, title, config }) => {
  const plotRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (plotRef.current) {
      const finalLayout = {
        autosize: true,
        margin: { l: 50, r: 20, t: 30, b: 40 },
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        font: { family: 'inherit', color: 'var(--text-primary)' },
        xaxis: { gridcolor: 'rgba(255,255,255,0.1)', zerolinecolor: 'rgba(255,255,255,0.2)' },
        yaxis: { gridcolor: 'rgba(255,255,255,0.1)', zerolinecolor: 'rgba(255,255,255,0.2)' },
        ...layout,
      };
      const finalConfig = { displayModeBar: true, responsive: true, ...config };
      
      Plotly.newPlot(plotRef.current, data, finalLayout, finalConfig);
    }
  }, [data, layout, config]);

  useEffect(() => {
    const handleResize = () => {
      if (plotRef.current) Plotly.Plots.resize(plotRef.current);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="plot-container" style={{ display: 'flex', flexDirection: 'column', width: '100%', flex: 1, minHeight: '400px' }}>
      {title && <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)', flexShrink: 0 }}>{title}</h3>}
      <div style={{ flex: 1, position: 'relative' }}>
        <div ref={plotRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      </div>
    </div>
  );
};

export default PlotViewer;
