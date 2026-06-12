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
import type { PredictedCross } from '../../../engine/crossSelector/crossEngine';

const nodeWidth = 150;
const nodeHeight = 60;

interface CrossNodeData {
  label: string;
  type: 'parent' | 'cross';
  merit?: number;
}

// Custom Node to display Cross info
const CrossNodeComponent = ({ data }: { data: CrossNodeData }) => {
  const isParent = data.type === 'parent';
  const bgColor = isParent ? 'var(--bg-surface)' : 'hsla(212, 100%, 48%, 0.1)';
  const borderStyle = isParent ? '1px solid rgba(0, 0, 0, 0.06)' : '1px solid var(--color-accent)';

  return (
    <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0.5rem', width: nodeWidth, height: nodeHeight, background: bgColor, color: 'var(--text-primary)', borderRadius: '8px', border: borderStyle, transition: 'all 0.3s ease' }}>
      {!isParent && <Handle type="target" position={Position.Top} style={{ background: 'var(--border-color)', top: '-2px' }} />}
      <div style={{ fontWeight: 600, fontSize: '0.875rem', width: '100%', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.label}</div>
      {!isParent && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Merit: {data.merit?.toFixed(2)}</div>}
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--border-color)', bottom: '-2px' }} />
    </div>
  );
};

const nodeTypes = { crossNode: CrossNodeComponent };

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'TB') => {
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
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };

    return node;
  });

  return { nodes, edges };
};

interface Props {
  crosses: PredictedCross[];
}

export function CrossHasseVisualizer({ crosses }: Props) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    if (!crosses || crosses.length === 0) return;

    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];
    const parentSet = new Set<string>();

    crosses.forEach((c, idx) => {
      parentSet.add(c.parent1);
      parentSet.add(c.parent2);
      
      const crossId = `cross-${idx}`;
      newNodes.push({
        id: crossId,
        type: 'crossNode',
        data: { label: `${c.parent1} x ${c.parent2}`, type: 'cross', merit: c.merit },
        position: { x: 0, y: 0 }
      });

      newEdges.push({
        id: `e-${c.parent1}-${crossId}`,
        source: c.parent1,
        target: crossId,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 },
      });

      newEdges.push({
        id: `e-${c.parent2}-${crossId}`,
        source: c.parent2,
        target: crossId,
        type: 'smoothstep',
        animated: true,
        style: { stroke: '#ec4899', strokeWidth: 2 },
      });
    });

    parentSet.forEach(p => {
      newNodes.push({
        id: p,
        type: 'crossNode',
        data: { label: p, type: 'parent' },
        position: { x: 0, y: 0 }
      });
    });

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(newNodes, newEdges);

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [crosses, setNodes, setEdges]);

  return (
    <div style={{ width: '100%', height: '400px', border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg-secondary)', overflow: 'hidden' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        minZoom={0.2}
        maxZoom={2}
        nodesDraggable={true}
      >
        <Background color="#ccc" gap={16} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
