import React, { Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { BookOpen, Activity, Dna, LayoutDashboard, Database } from 'lucide-react';
import { ToolRegistry } from './config/toolRegistry';

// Assume index.css provides the root variables and base resets

// Explicit lazy imports for Vite bundle analysis
const componentMap: Record<string, React.LazyExoticComponent<any>> = {
  "breeders_equation/BreedersEquationView": React.lazy(() => import('./components/tools/breeders_equation/BreedersEquationView')),
  "lmm_visualizer/LmmVisualizerView": React.lazy(() => import('./components/tools/lmm_visualizer/LmmVisualizerView')),
  "hasse_designer/HasseDesignerView": React.lazy(() => import('./components/tools/hasse_designer/HasseDesignerView'))
};

const loadComponent = (componentPath: string) => {
  const Component = componentMap[componentPath];
  if (!Component) {
    return () => <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center' }}>Component {componentPath} Not Found</div>;
  }
  return Component;
};

// Map categories or IDs to icons
const getIcon = (id: string) => {
  if (id.includes('spatial')) return <Database size={18} />;
  if (id.includes('population')) return <Activity size={18} />;
  if (id.includes('genomic')) return <Dna size={18} />;
  if (id.includes('breeders')) return <Activity size={18} />;
  if (id.includes('lmm')) return <LayoutDashboard size={18} />;
  return <BookOpen size={18} />;
};

function AppShell() {
  return (
    <Router>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        
        {/* Sidebar Navigation */}
        <aside style={{ 
          width: '280px', 
          borderRight: '1px solid var(--border-light)', 
          padding: '2rem 1.5rem', 
          display: 'flex', 
          flexDirection: 'column',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 100%)',
          zIndex: 10
        }}>
          <NavLink to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem' }}>
              <div style={{ 
                background: 'linear-gradient(135deg, var(--color-accent), #6366f1)',
                borderRadius: '8px',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 15px var(--color-accent-glow)'
              }}>
                <Dna size={24} color="white" />
              </div>
              <div>
                <h1 style={{ fontSize: '1.25rem', margin: 0, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>QGen Hub</h1>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Quantitative Genetics</p>
              </div>
            </div>
          </NavLink>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, overflowY: 'auto' }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.5rem', marginLeft: '0.5rem' }}>
              Simulators & Models
            </div>
            {ToolRegistry.map((tool) => (
              <NavLink 
                key={tool.id} 
                to={tool.path}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                {getIcon(tool.id)}
                <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{tool.title}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main style={{ flex: 1, overflow: 'auto', padding: '2rem 3rem', position: 'relative' }}>
          {/* subtle background glow */}
          <div style={{ position: 'absolute', top: '-10%', left: '50%', width: '50vw', height: '50vw', background: 'radial-gradient(circle, var(--color-accent-glow) 0%, transparent 70%)', transform: 'translateX(-50%)', opacity: 0.5, pointerEvents: 'none', zIndex: 0 }}></div>
          
          <div style={{ position: 'relative', zIndex: 1, height: '100%' }}>
            <Suspense fallback={
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                <div style={{ width: '40px', height: '40px', border: '3px solid var(--border-light)', borderTopColor: 'var(--color-accent)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <div style={{ marginTop: '1rem', fontWeight: 500 }}>Loading simulator...</div>
              </div>
            }>
              <Routes>
                <Route path="/" element={
                  <div className="glass-panel" style={{ padding: '4rem', textAlign: 'center', maxWidth: '600px', margin: '4rem auto' }}>
                    <h2 style={{ fontSize: '2.5rem', marginBottom: '1rem', background: 'linear-gradient(to right, #fff, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Welcome to the Lab</h2>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', marginBottom: '2rem' }}>
                      Select a simulator from the sidebar to begin running experiments and visualizing quantitative genetics concepts in real-time.
                    </p>
                  </div>
                } />
                
                {ToolRegistry.map((tool) => {
                  const ToolComponent = loadComponent(tool.component);
                  return (
                    <Route 
                      key={tool.id} 
                      path={tool.path} 
                      element={<ToolComponent />} 
                    />
                  );
                })}
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </Router>
  );
}

export default AppShell;
