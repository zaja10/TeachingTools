import { useEffect } from 'react';
import { 
  ReactFlow,
  Background, 
  Controls, 
  useNodesState, 
  useEdgesState, 
  type Node, 
  type Edge,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import type { HasseGraph as EngineGraph, HasseNode } from '../engine/Graph';

type ExtendedHasseNode = HasseNode & {
  isTesting?: boolean;
};

const nodeWidth = 120;
const nodeHeight = 60;

// Custom Node to display Factor info beautifully
const HasseNodeComponent = ({ data }: { data: ExtendedHasseNode }) => {
  const bgColor = data.type === 'Mean' ? 'var(--bg-surface)' 
    : data.type === 'Random' ? 'hsl(210, 20%, 92%)' 
    : 'hsla(212, 100%, 48%, 0.1)';

  const borderRadius = data.type === 'Fixed' ? '4px' : data.type === 'Random' ? '50px' : '8px';
  const borderStyle = data.type === 'Random' ? '2px dashed #94a3b8' : '1px solid rgba(0, 0, 0, 0.06)';

  let className = `glass-panel`;
  if (data.isTesting) className += ' testing';

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.5rem', width: nodeWidth, height: nodeHeight, background: bgColor, color: 'var(--text-primary)', borderRadius, border: borderStyle, transition: 'all 0.3s ease' }}>
      <Handle type="target" position={Position.Top} style={{ width: '40px', background: 'var(--border-color)', top: '-2px' }} />
      <div style={{ fontWeight: 600, fontSize: '0.875rem', width: '100%', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.name}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>N: {data.n} | df: {data.df}</div>
      <Handle type="source" position={Position.Bottom} style={{ width: '40px', background: 'var(--border-color)', bottom: '-2px' }} />
    </div>
  );
};

const nodeTypes = { hasse: HasseNodeComponent };

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB', startX = 0) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  dagreGraph.setGraph({ rankdir: direction, ranksep: 60, nodesep: 40 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = direction === 'TB' ? Position.Top : Position.Left;
    node.sourcePosition = direction === 'TB' ? Position.Bottom : Position.Right;

    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2 + startX,
      y: nodeWithPosition.y - nodeHeight / 2,
    };

    return node;
  });

  return { nodes, edges };
};

interface HasseGraphProps {
  uGraph: EngineGraph | null;
  tGraph: EngineGraph | null;
  selectedNodeId?: string | null;
  onNodeClick?: (id: string) => void;
}

export function HasseGraph({ uGraph, tGraph, selectedNodeId, onNodeClick }: HasseGraphProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (!uGraph || !tGraph) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const uNodes = uGraph.nodes.map(n => ({
      id: n.id,
      type: 'hasse',
      data: { ...n },
      position: { x: 0, y: 0 },
      className: n.id === selectedNodeId ? 'selected' : '',
    }));

    const uEdges = uGraph.edges.map(e => ({
      id: `${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      type: 'step',
      animated: false,
      style: { stroke: '#94a3b8', strokeWidth: 2 },
    }));

    const tNodes = tGraph.nodes.map(n => ({
      id: n.id,
      type: 'hasse',
      data: { ...n },
      position: { x: 0, y: 0 },
      className: n.id === selectedNodeId ? 'selected' : '',
    }));

    const tEdges = tGraph.edges.map(e => ({
      id: `${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      type: 'step',
      animated: false,
      style: { stroke: '#3b82f6', strokeWidth: 2 },
    }));

    const { nodes: lUNodes, edges: lUEdges } = getLayoutedElements(uNodes, uEdges, 'TB', 0);
    
    let xOffset = 0;
    if (lUNodes.length > 0) {
      const maxX = Math.max(...lUNodes.map(n => n.position.x));
      xOffset = maxX + 200;
    }
    
    const { nodes: lTNodes, edges: lTEdges } = getLayoutedElements(tNodes, tEdges, 'TB', xOffset);

    setNodes([...lUNodes, ...lTNodes]);
    setEdges([...lUEdges, ...lTEdges]);
  }, [uGraph, tGraph, selectedNodeId, setNodes, setEdges]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={(_, node) => onNodeClick?.(node.id)}
        onPaneClick={() => onNodeClick?.('')}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.5}
        maxZoom={2}
        nodesDraggable={false}
      >
        <Background color="#ccc" gap={16} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
