import { useState, useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Panel,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  Handle,
  Position,
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';


type BuilderNodeType = 'Fixed' | 'Random' | 'Mean';

type BuilderNodeData = Record<string, unknown> & {
  name: string;
  n: number;
  type: BuilderNodeType;
  df?: number;
  error?: string;
};

const BuilderNode = ({ data, selected }: { data: BuilderNodeData; selected: boolean }) => {
  const bgColor = data.type === 'Mean' ? 'var(--bg-surface)' 
    : data.type === 'Random' ? 'hsl(210, 20%, 92%)' 
    : 'hsla(212, 100%, 48%, 0.1)';

  const borderRadius = data.type === 'Fixed' ? '4px' : data.type === 'Random' ? '50px' : '8px';
  const borderStyle = data.type === 'Random' ? '2px dashed #94a3b8' : '1px solid rgba(0, 0, 0, 0.06)';

  let className = `glass-panel`;
  if (selected) className += ' selected';
  if (data.error) className += ' confounded';

  return (
    <div className={className} style={{ 
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', 
      padding: '0.5rem', width: 120, height: 60, background: bgColor, 
      color: 'var(--text-primary)', borderRadius, border: borderStyle, 
      transition: 'all 0.3s ease',
      boxShadow: selected ? '0 0 0 2px var(--accent-primary)' : 'var(--shadow-sm)'
    }}>
      <Handle type="target" position={Position.Top} style={{ width: '40px', background: 'var(--border-color)', top: '-2px' }} />
      <div style={{ fontWeight: 600, fontSize: '0.875rem', width: '100%', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.name}</div>
      <div style={{ fontSize: '0.75rem', color: data.error ? '#ef4444' : 'var(--text-secondary)' }}>
        N: {data.n} | df: {data.df ?? '?'}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ width: '40px', background: 'var(--border-color)', bottom: '-2px' }} />
    </div>
  );
};

const nodeTypes = { builderNode: BuilderNode };

// Toposort and calculate DF using waterfall rule
function calculateDFs(nodes: Node<BuilderNodeData>[], edges: Edge[]): Node<BuilderNodeData>[] {
  const inDegree = new Map<string, number>();
  const parents = new Map<string, string[]>();
  
  nodes.forEach(n => {
    inDegree.set(n.id, 0);
    parents.set(n.id, []);
  });

  edges.forEach(e => {
    if (inDegree.has(e.target)) {
      inDegree.set(e.target, inDegree.get(e.target)! + 1);
      parents.get(e.target)!.push(e.source);
    }
  });

  // Toposort
  const queue: string[] = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const sorted: string[] = [];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    sorted.push(curr);
    edges.filter(e => e.source === curr).forEach(e => {
      const target = e.target;
      inDegree.set(target, inDegree.get(target)! - 1);
      if (inDegree.get(target) === 0) queue.push(target);
    });
  }

  // If cycle detected, return nodes with error
  if (sorted.length !== nodes.length) {
    return nodes.map(n => ({ ...n, data: { ...n.data, df: undefined, error: 'Cycle detected' } }));
  }

  // Calculate DF waterfall
  const dfMap = new Map<string, number>();
  
  const getAncestors = (id: string) => {
    const ancestors = new Set<string>();
    const stack = [id];
    while (stack.length > 0) {
      const curr = stack.pop()!;
      for (const p of parents.get(curr) || []) {
        if (!ancestors.has(p)) {
          ancestors.add(p);
          stack.push(p);
        }
      }
    }
    return ancestors;
  };

  const nextNodes = nodes.map(n => ({ ...n, data: { ...n.data, error: undefined as string | undefined } }));

  for (const id of sorted) {
    const node = nextNodes.find(n => n.id === id)!;
    const ancestors = Array.from(getAncestors(id));
    
    let sumAncestorDf = 0;
    for (const ancId of ancestors) {
      sumAncestorDf += dfMap.get(ancId) || 0;
    }

    const df = node.data.n - sumAncestorDf;
    dfMap.set(id, df);
    node.data.df = df;

    if (df <= 0 && node.data.type !== 'Mean') {
      node.data.error = `DF is ${df}. Confounded!`;
    }
  }

  return nextNodes;
}

interface VisualBuilderProps {
  onExitVisualMode: () => void;
}

export function VisualBuilder({ onExitVisualMode }: VisualBuilderProps) {
  const [nodes, setNodes] = useState<Node<BuilderNodeData>[]>([
    { id: 'mean', type: 'builderNode', position: { x: 400, y: 50 }, data: { name: 'Y', n: 1, type: 'Mean' } }
  ]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => {
      const nextNds = applyNodeChanges(changes, nds as Node[]) as unknown as Node<BuilderNodeData>[];
      const needsRecalc = changes.some(c => c.type === 'remove' || c.type === 'add');
      return needsRecalc ? calculateDFs(nextNds, edges) : nextNds;
    }),
    [edges]
  );
  
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => {
      const nextEds = applyEdgeChanges(changes, eds);
      setNodes(nds => calculateDFs(nds, nextEds));
      return nextEds;
    }),
    []
  );
  
  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => {
      const nextEds = addEdge({ ...params, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed } }, eds);
      setNodes(nds => calculateDFs(nds, nextEds));
      return nextEds;
    }),
    []
  );

  const addFactor = (type: BuilderNodeType) => {
    const meanNode = nodes.find(n => n.data.type === 'Mean');
    let spawnX = Math.random() * 200 + 200;
    let spawnY = Math.random() * 200 + 200;
    
    if (meanNode) {
      spawnX = meanNode.position.x + (Math.random() * 100 - 50);
      spawnY = meanNode.position.y + 100 + (Math.random() * 50);
    }

    const newNode: Node<BuilderNodeData> = {
      id: uuidv4(),
      type: 'builderNode',
      position: { x: spawnX, y: spawnY },
      data: { name: type === 'Mean' ? 'Y' : `New ${type}`, n: type === 'Mean' ? 1 : 2, type }
    };
    setNodes(nds => calculateDFs([...nds, newNode], edges));
  };

  const updateSelectedNode = (key: 'name' | 'n', value: string | number) => {
    if (selectedNodeIds.length !== 1) return;
    const selectedNodeId = selectedNodeIds[0];
    setNodes(nds => {
      const nextNds = nds.map(n => n.id === selectedNodeId ? { ...n, data: { ...n.data, [key]: value } } : n);
      return calculateDFs(nextNds, edges);
    });
  };

  const deleteSelectedNode = () => {
    if (selectedNodeIds.length !== 1) return;
    const selectedNodeId = selectedNodeIds[0];
    
    setNodes(nds => {
      const nextNds = nds.filter(n => n.id !== selectedNodeId);
      const nextEds = edges.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId);
      setEdges(nextEds);
      return calculateDFs(nextNds, nextEds);
    });
    setSelectedNodeIds([]);
  };

  const interactSelected = () => {
    const validNodes = nodes.filter(n => selectedNodeIds.includes(n.id) && n.data.type !== 'Mean');
    if (validNodes.length < 2) return;
    
    const isRandom = validNodes.some(n => n.data.type === 'Random');
    const newType = isRandom ? 'Random' : 'Fixed';
    
    const getAncestors = (id: string, visited = new Set<string>()): string[] => {
      if (visited.has(id)) return [];
      visited.add(id);
      const parents = edges.filter(e => e.target === id).map(e => e.source);
      let allAnc = [...parents];
      for (const p of parents) {
        allAnc = allAnc.concat(getAncestors(p, visited));
      }
      return Array.from(new Set(allAnc));
    };

    const allNames = new Set<string>();
    validNodes.forEach(n => {
      n.data.name.split(':').forEach(part => allNames.add(part.trim()));
    });
    
    const nameToNodeId = new Map<string, string>();
    nodes.forEach(n => {
      if (!n.data.name.includes(':')) {
        nameToNodeId.set(n.data.name.trim(), n.id);
      }
    });
    
    const toRemove = new Set<string>();
    for (const name of allNames) {
      for (const otherName of allNames) {
        if (name === otherName) continue;
        const otherId = nameToNodeId.get(otherName);
        if (otherId) {
          const otherAncestors = getAncestors(otherId);
          const otherAncNames = otherAncestors.map(aid => nodes.find(x => x.id === aid)?.data.name);
          if (otherAncNames.includes(name)) {
            toRemove.add(name);
          }
        }
      }
    }
    
    const newName = Array.from(allNames).filter(n => !toRemove.has(n)).join(':');

    const newN = validNodes.reduce((acc, n) => acc * n.data.n, 1);
    
    const avgX = validNodes.reduce((sum, n) => sum + n.position.x, 0) / validNodes.length;
    const maxY = Math.max(...validNodes.map(n => n.position.y)) + 120;
    
    const newNodeId = uuidv4();
    const newNode: Node<BuilderNodeData> = {
      id: newNodeId,
      type: 'builderNode',
      position: { x: avgX, y: maxY },
      data: { name: newName, n: newN, type: newType }
    };
    
    const newEdges = validNodes.map(n => ({
      id: uuidv4(),
      source: n.id,
      target: newNodeId,
      type: 'smoothstep',
      markerEnd: { type: MarkerType.ArrowClosed }
    }));
    
    setNodes(nds => calculateDFs([...nds, newNode], [...edges, ...newEdges]));
    setEdges(eds => [...eds, ...newEdges]);
  };

  const deriveFormula = (type: 'Fixed' | 'Random' | 'Residual') => {
    let relevantNodes = type === 'Fixed' ? nodes.filter(n => n.data.type === 'Fixed') : nodes.filter(n => n.data.type === 'Random');

    const getAncestors = (id: string, visited = new Set<string>()): string[] => {
      if (visited.has(id)) return [];
      visited.add(id);
      const parents = edges.filter(e => e.target === id).map(e => e.source);
      let allAnc = [...parents];
      for (const p of parents) {
        allAnc = allAnc.concat(getAncestors(p, visited));
      }
      return Array.from(new Set(allAnc));
    };

    if (type === 'Random' || type === 'Residual') {
      const allAncestorsOfRandomNodes = new Set<string>();
      const randomNodes = nodes.filter(n => n.data.type === 'Random');
      randomNodes.forEach(n => {
        getAncestors(n.id).forEach(id => allAncestorsOfRandomNodes.add(id));
      });
      if (type === 'Residual') {
        relevantNodes = randomNodes.filter(n => !allAncestorsOfRandomNodes.has(n.id));
      } else {
        relevantNodes = randomNodes.filter(n => allAncestorsOfRandomNodes.has(n.id));
        
        // Advanced Pruning: If a Random term is subsumed by an interaction with a Fixed term, hide it.
        const fixedBaseFactors = new Set<string>();
        nodes.filter(n => n.data.type === 'Fixed').forEach(n => {
          n.data.name.split(':').forEach(f => fixedBaseFactors.add(f.trim()));
        });
        
        relevantNodes = relevantNodes.filter(n => {
          const nFactors = n.data.name.split(':').map(s => s.trim());
          const isSubsumed = randomNodes.some(m => {
            if (m.id === n.id) return false;
            const mFactors = m.data.name.split(':').map(s => s.trim());
            
            const containsAll = nFactors.every(f => mFactors.includes(f));
            if (!containsAll) return false;
            
            const extraFactors = mFactors.filter(f => !nFactors.includes(f));
            return extraFactors.some(f => fixedBaseFactors.has(f));
          });
          return !isSubsumed;
        });
      }
    }

    if (relevantNodes.length === 0) return 'None';

    const terms = relevantNodes.map(n => {
      if (type === 'Random' || type === 'Residual') {
        return n.data.name;
      }

      const ancIds = getAncestors(n.id);
      const ancNames = ancIds
        .map(aid => nodes.find(x => x.id === aid))
        .filter(x => x && x.data.type !== 'Mean')
        .map(x => x!.data.name);
      
      const parts = [...ancNames, n.data.name];
      const baseFactors = new Set<string>();
      parts.forEach(p => {
        if (p) {
          p.split(':').forEach(f => {
            const trimmed = f.trim();
            if (trimmed) baseFactors.add(trimmed);
          });
        }
      });
      
      return Array.from(baseFactors).join(':');
    });

    return terms.join(' + ');
  };

  const selectedNodes = nodes.filter(n => selectedNodeIds.includes(n.id));
  const singleNode = selectedNodes.length === 1 ? selectedNodes[0] : null;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      {/* Formula Display Bar */}
      <div style={{ padding: '1rem', background: 'var(--bg-surface-elevated)', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '2rem', zIndex: 10 }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Generated Random Formula</span>
          <div style={{ fontFamily: 'monospace', color: 'var(--text-primary)', marginTop: '0.25rem' }}>{deriveFormula('Random')}</div>
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Generated Residual Formula</span>
          <div style={{ fontFamily: 'monospace', color: 'var(--text-primary)', marginTop: '0.25rem' }}>{deriveFormula('Residual')}</div>
        </div>
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Generated Fixed Formula</span>
          <div style={{ fontFamily: 'monospace', color: 'var(--accent-primary)', marginTop: '0.25rem' }}>{deriveFormula('Fixed')}</div>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative' }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={useCallback((params: { nodes: Node[]; edges: Edge[] }) => {
            const newIds = params.nodes.map(n => n.id).sort();
            setSelectedNodeIds(prev => {
              const prevSorted = [...prev].sort();
              if (prevSorted.length === newIds.length && prevSorted.every((id, i) => id === newIds[i])) return prev;
              return newIds;
            });
          }, [])}
          fitView
          fitViewOptions={{ padding: 0.5 }}
          defaultEdgeOptions={{ type: 'smoothstep' }}
        >
          <Background color="#ccc" gap={16} />
          <Controls />
          
          <Panel position="top-left" className="glass-panel" style={{ padding: '1rem', background: 'var(--bg-surface)', borderRadius: '8px', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-color)', width: '220px' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>Palette</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button className="btn btn-primary" onClick={onExitVisualMode} style={{ marginBottom: '0.5rem' }}>&larr; Exit Visual Mode</button>
              <button className="btn btn-secondary" onClick={() => addFactor('Mean')}>+ Add Mean</button>
              <button className="btn btn-secondary" onClick={() => addFactor('Fixed')}>+ Add Fixed Factor</button>
              <button className="btn btn-secondary" onClick={() => addFactor('Random')}>+ Add Random Factor</button>
            </div>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '1rem', lineHeight: '1.4' }}>
              Drag handles to connect. Shift+Drag to select multiple.
            </p>
          </Panel>

          {singleNode && (
            <Panel position="top-right" className="glass-panel" style={{ padding: '1rem', background: 'var(--bg-surface)', borderRadius: '8px', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-color)', width: '220px' }}>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.875rem' }}>Edit Node</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Name</label>
                  <input className="input" value={singleNode.data.name} onChange={e => updateSelectedNode('name', e.target.value)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Total Levels (N)</label>
                  <input className="input" type="number" min={1} value={singleNode.data.n} onChange={e => updateSelectedNode('n', parseInt(e.target.value) || 1)} />
                </div>
                <button className="btn btn-secondary" style={{ color: '#ef4444', marginTop: '0.5rem' }} onClick={deleteSelectedNode}>Delete Node</button>
              </div>
            </Panel>
          )}

          {selectedNodes.length >= 2 && (
             <Panel position="top-right" className="glass-panel" style={{ padding: '1rem', background: 'var(--bg-surface)', borderRadius: '8px', boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-color)', width: '220px' }}>
              <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.875rem' }}>Interact Nodes</h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Create an interaction block between {selectedNodes.length} factors.</p>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={interactSelected}>Interact Selected</button>
            </Panel>
          )}

        </ReactFlow>
      </div>
    </div>
  );
}
