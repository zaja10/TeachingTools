import './App.css';
import React, { Suspense } from 'react';
import { HashRouter as Router, Routes, Route, NavLink } from 'react-router-dom';
import { BookOpen, Activity, Dna, LayoutDashboard, Database } from 'lucide-react';
import { ToolRegistry } from './config/toolRegistry';

// Assume index.css provides the root variables and base resets

// Explicit lazy imports for Vite bundle analysis
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const componentMap: Record<string, React.LazyExoticComponent<any>> = {
  "breeders_equation/BreedersEquationView": React.lazy(() => import('./components/tools/breeders_equation/BreedersEquationView')),
  "lmm_visualizer/LmmVisualizerView": React.lazy(() => import('./components/tools/lmm_visualizer/LmmVisualizerView')),
  "hasse_designer/HasseDesignerView": React.lazy(() => import('./components/tools/hasse_designer/HasseDesignerView')),
  "net_merit_optimizer/NetMeritOptimizerView": React.lazy(() => import('./components/tools/net_merit_optimizer/NetMeritOptimizerView')),
  "open_index_gen/OpenIndexGenView": React.lazy(() => import('./components/tools/open_index_gen/OpenIndexGenView')),
  "grmaker/GRMakerApp": React.lazy(() => import('./components/tools/grmaker/GRMakerApp')),
  "plotmaker/PlotmakerApp": React.lazy(() => import('./components/tools/plotmaker/PlotmakerApp'))
};

const loadComponent = (componentPath: string) => {
  const Component = componentMap[componentPath];
  if (!Component) {
    return () => <div className="glass-panel app-style-1">Component {componentPath} Not Found</div>;
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
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  return (
    <Router>
      <div className="app-style-2">
        
        {/* Sidebar Navigation */}
        <aside 
          onMouseEnter={() => setIsSidebarOpen(true)}
          onMouseLeave={() => setIsSidebarOpen(false)}
          style={{ 
            width: isSidebarOpen ? '280px' : '80px', 
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            borderRight: '1px solid var(--border-light)', 
            padding: '2rem 1rem', 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: isSidebarOpen ? 'stretch' : 'center',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 100%)',
            zIndex: 10,
            overflowX: 'hidden'
          }}
        >
          <NavLink to="/" className="app-style-3">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem', width: '100%', justifyContent: isSidebarOpen ? 'flex-start' : 'center' }}>
              <div style={{ 
                background: 'linear-gradient(135deg, var(--color-accent), #6366f1)',
                borderRadius: '8px',
                padding: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 15px var(--color-accent-glow)',
                flexShrink: 0
              }}>
                <Dna size={24} color="white" />
              </div>
              <div style={{ 
                opacity: isSidebarOpen ? 1 : 0, 
                width: isSidebarOpen ? 'auto' : 0, 
                overflow: 'hidden', 
                transition: 'opacity 0.3s' 
              }}>
                <h1 className="app-style-4">QGen Hub</h1>
                <p className="app-style-5">Quantitative Genetics</p>
              </div>
            </div>
          </NavLink>

          <nav className="app-style-6">
            {Array.from(new Set(ToolRegistry.map(t => t.category))).map(category => (
              <div key={category} className="app-style-7">
                <div style={{ 
                  fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', 
                  marginBottom: '0.5rem', textAlign: isSidebarOpen ? 'left' : 'center',
                  opacity: isSidebarOpen ? 1 : 0, transition: 'opacity 0.3s'
                }}>
                  {isSidebarOpen ? category : '•'}
                </div>
                {ToolRegistry.filter(t => t.category === category).map((tool) => (
                  <NavLink 
                    key={tool.id} 
                    to={tool.path}
                    className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
                    title={tool.title}
                    style={{ justifyContent: isSidebarOpen ? 'flex-start' : 'center', padding: isSidebarOpen ? '0.75rem 1rem' : '0.75rem 0' }}
                  >
                    <div className="app-style-8">
                      {getIcon(tool.id)}
                    </div>
                    <span style={{ 
                      fontWeight: 500, fontSize: '0.9rem', whiteSpace: 'nowrap',
                      opacity: isSidebarOpen ? 1 : 0, width: isSidebarOpen ? 'auto' : 0, overflow: 'hidden', transition: 'opacity 0.3s'
                    }}>
                      {tool.title}
                    </span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="app-style-9">
          {/* subtle background glow */}
          <div style={{ position: 'absolute', top: '-10%', left: '50%', width: '50vw', height: '50vw', background: 'radial-gradient(circle, var(--color-accent-glow) 0%, transparent 70%)', transform: 'translateX(-50%)', opacity: 0.5, pointerEvents: 'none', zIndex: 0 }}></div>
          
          <div className="app-style-10">
            <Suspense fallback={
              <div className="app-style-11">
                <div className="app-style-12"></div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <div className="app-style-13">Loading simulator...</div>
              </div>
            }>
              <Routes>
                <Route path="/" element={
                  <div className="glass-panel app-style-14">
                    <h2 style={{ fontSize: '2.5rem', marginBottom: '1rem', background: 'linear-gradient(to right, #fff, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Welcome to the Lab</h2>
                    <p className="app-style-15">
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
