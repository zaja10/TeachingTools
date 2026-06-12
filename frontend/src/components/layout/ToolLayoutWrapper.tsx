import React, { type ReactNode } from 'react';

interface ToolLayoutProps {
  header: ReactNode;
  controls: ReactNode;
  canvas: ReactNode;
  metrics: ReactNode;
}

const ToolLayoutWrapper: React.FC<ToolLayoutProps> = ({ header, controls, canvas, metrics }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', height: '100%', animation: 'fadeIn 0.5s ease-out' }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      
      {/* Tool Header */}
      <header className="glass-panel" style={{ padding: '0.75rem 1.5rem', borderLeft: '4px solid var(--color-accent)' }}>
        {header}
      </header>

      <div style={{ display: 'flex', gap: '1.5rem', flex: 1, minHeight: 0 }}>
        {controls && (
          <aside className="glass-panel" style={{ 
            width: '320px', 
            padding: '1.5rem', 
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {controls}
          </aside>
        )}

        {/* Visualization Canvas */}
        <section className="glass-panel" style={{ 
          flex: 1, 
          padding: '1rem', 
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative'
        }}>
          {/* Subtle grid background for the canvas area */}
          <div style={{ 
             position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, 
             backgroundImage: 'linear-gradient(var(--bg-surface-hover) 1px, transparent 1px), linear-gradient(90deg, var(--bg-surface-hover) 1px, transparent 1px)', 
             backgroundSize: '20px 20px', opacity: 0.3, pointerEvents: 'none', zIndex: 0 
          }}></div>
          
          <div style={{ position: 'relative', zIndex: 1, height: '100%', width: '100%' }}>
            {canvas}
          </div>
        </section>
      </div>

      {/* Metrics Footer */}
      <footer className="glass-panel" style={{ 
        padding: '1rem 2rem', 
        background: 'linear-gradient(90deg, var(--bg-surface), rgba(139, 92, 246, 0.05))' 
      }}>
        {metrics}
      </footer>
    </div>
  );
};

export default ToolLayoutWrapper;
