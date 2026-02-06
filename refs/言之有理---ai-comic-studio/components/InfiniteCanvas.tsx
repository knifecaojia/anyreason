
import React, { useState, useRef } from 'react';
import { WorkflowNode, WorkflowEdge } from '../types';
import { Sparkles, Image as ImageIcon, FileText, Music, Play, GripHorizontal, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface InfiniteCanvasProps {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  onNodeMove: (id: string, dx: number, dy: number) => void;
}

interface NodeComponentProps {
  node: WorkflowNode;
  isSelected: boolean;
  onSelect: () => void;
  updatePos: (dx: number, dy: number) => void;
}

const NodeComponent: React.FC<NodeComponentProps> = ({ node, isSelected, onSelect, updatePos }) => {
  const nodeRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect();
    
    const startX = e.clientX;
    const startY = e.clientY;
    
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      updatePos(dx, dy);
    };
    
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const getIcon = () => {
    switch(node.type) {
      case 'LLM_SCRIPT': return <FileText size={18} className="text-purple-400" />;
      case 'SD_IMAGE': return <ImageIcon size={18} className="text-pink-400" />;
      case 'TTS_AUDIO': return <Music size={18} className="text-cyan-400" />;
      case 'VIDEO_GEN': return <Play size={18} className="text-orange-400" />;
      default: return <Sparkles size={18} className="text-yellow-400" />;
    }
  };

  const getBorderColor = () => {
    if (node.data.status === 'running') return 'border-primary shadow-[0_0_15px_rgba(59,130,246,0.5)]';
    if (isSelected) return 'border-primary ring-2 ring-primary/20';
    return 'border-border hover:border-textMuted';
  };

  return (
    <div 
      ref={nodeRef}
      onMouseDown={handleMouseDown}
      style={{ 
        transform: `translate(${node.position.x}px, ${node.position.y}px)`,
        position: 'absolute'
      }}
      className={`w-72 bg-surfaceHighlight border ${getBorderColor()} rounded-xl shadow-2xl transition-all cursor-grab active:cursor-grabbing select-none`}
    >
      <div className="flex items-center gap-2 p-3 border-b border-border/50 bg-surface/50 rounded-t-xl">
        <div className="p-1.5 rounded-md bg-background border border-border">
          {getIcon()}
        </div>
        <span className="font-semibold text-sm text-textMain flex-1">{node.data.label}</span>
        
        {/* Status Indicators */}
        {node.data.status === 'running' && <Loader2 size={16} className="text-primary animate-spin" />}
        {node.data.status === 'success' && <CheckCircle size={16} className="text-green-500" />}
        {node.data.status === 'error' && <AlertCircle size={16} className="text-red-500" />}
        
        <GripHorizontal size={16} className="text-textMuted opacity-50 ml-2" />
      </div>
      <div className="p-4 space-y-3">
        {node.data.model && (
           <div className="text-xs flex items-center gap-2 text-textMuted bg-background/50 p-2 rounded">
             <span className="opacity-60">Model:</span>
             <span className="font-mono text-accent">{node.data.model}</span>
           </div>
        )}
        
        {/* Input Prompt */}
        {node.data.prompt && (
          <div className="space-y-1">
            <span className="text-[10px] text-textMuted uppercase tracking-wider font-semibold">Input</span>
            <div className="text-xs text-textMuted/80 bg-background/30 p-2 rounded max-h-20 overflow-hidden relative">
              {node.data.prompt}
            </div>
          </div>
        )}

        {/* Output Area */}
        {node.data.output && (
           <div className="space-y-1 animate-fade-in">
             <span className="text-[10px] text-green-400 uppercase tracking-wider font-semibold">Output</span>
             <div className="text-xs text-textMain bg-background p-2 rounded max-h-40 overflow-y-auto border border-border scrollbar-thin">
               {node.data.output}
             </div>
           </div>
        )}
        
        {!node.data.prompt && !node.data.output && (
          <div className="text-xs text-textMuted italic">Wait for input...</div>
        )}
      </div>
      
      {/* Ports */}
      <div className="absolute -left-1.5 top-1/2 w-3 h-3 bg-textMuted rounded-full border-2 border-surfaceHighlight hover:bg-primary transition-colors" />
      <div className="absolute -right-1.5 top-1/2 w-3 h-3 bg-textMuted rounded-full border-2 border-surfaceHighlight hover:bg-primary transition-colors" />
    </div>
  );
};

export const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({ nodes, edges, onNodeMove }) => {
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Canvas Pan & Zoom Logic
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = 0.001;
      const newScale = Math.max(0.1, Math.min(3, transform.k - e.deltaY * zoomFactor));
      setTransform(prev => ({ ...prev, k: newScale }));
    } else {
      setTransform(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 0) { // Middle or Left click on BG
       setIsDraggingCanvas(true);
       const startX = e.clientX;
       const startY = e.clientY;
       const startTx = transform.x;
       const startTy = transform.y;

       const handleMouseMove = (moveEvent: MouseEvent) => {
         setTransform(prev => ({
           ...prev,
           x: startTx + (moveEvent.clientX - startX),
           y: startTy + (moveEvent.clientY - startY)
         }));
       };

       const handleMouseUp = () => {
         setIsDraggingCanvas(false);
         document.removeEventListener('mousemove', handleMouseMove);
         document.removeEventListener('mouseup', handleMouseUp);
       };

       document.addEventListener('mousemove', handleMouseMove);
       document.addEventListener('mouseup', handleMouseUp);
    }
  };

  const handleUpdateNodePos = (id: string, dx: number, dy: number) => {
    // Calculate logical movement based on zoom level
    const logicalDx = dx / transform.k;
    const logicalDy = dy / transform.k;
    onNodeMove(id, logicalDx, logicalDy);
  };

  // Simple straight line rendering for edges (simulated)
  const renderEdges = () => {
    return edges.map(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) return null;

      const sx = sourceNode.position.x + 288; // Width of node
      const sy = sourceNode.position.y + 70; // Half height approx
      const tx = targetNode.position.x;
      const ty = targetNode.position.y + 70;

      // Cubic bezier curve path
      const pathData = `M ${sx} ${sy} C ${sx + 50} ${sy}, ${tx - 50} ${ty}, ${tx} ${ty}`;

      return (
        <g key={edge.id}>
          <path d={pathData} stroke="#4A5568" strokeWidth="2" fill="none" />
          <circle cx={tx} cy={ty} r="4" fill="#3B82F6" />
        </g>
      );
    });
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-background select-none">
      {/* Background Grid */}
      <div 
        className="absolute inset-0 grid-bg opacity-30 pointer-events-none"
        style={{ 
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
          transformOrigin: '0 0'
        }}
      />
      
      {/* Controls Overlay */}
      <div className="absolute top-4 left-4 z-10 bg-surface/90 backdrop-blur border border-border rounded-lg p-2 shadow-xl flex gap-2">
         <button className="p-2 hover:bg-surfaceHighlight rounded text-textMuted hover:text-textMain" title="Add Node">
            <Sparkles size={20} />
         </button>
         <div className="w-px bg-border h-6 my-auto"></div>
         <div className="text-xs text-textMuted flex items-center px-2 font-mono">
            Scale: {(transform.k * 100).toFixed(0)}%
         </div>
      </div>

      {/* Main Transform Layer */}
      <div 
        ref={canvasRef}
        onWheel={handleWheel}
        onMouseDown={handleCanvasMouseDown}
        className={`w-full h-full ${isDraggingCanvas ? 'cursor-grabbing' : 'cursor-grab'}`}
      >
        <div 
           style={{ 
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`,
            transformOrigin: '0 0',
            width: '100%',
            height: '100%'
          }}
        >
          {/* Edges Layer */}
          <svg className="absolute top-0 left-0 w-[5000px] h-[5000px] pointer-events-none overflow-visible">
            {renderEdges()}
          </svg>

          {/* Nodes Layer */}
          {nodes.map(node => (
            <NodeComponent 
              key={node.id} 
              node={node} 
              isSelected={selectedNodeId === node.id}
              onSelect={() => setSelectedNodeId(node.id)}
              updatePos={(dx, dy) => handleUpdateNodePos(node.id, dx, dy)}
            />
          ))}
        </div>
      </div>
      
      {/* Mini-map / Help Text */}
      <div className="absolute bottom-4 right-4 text-xs text-textMuted/50 pointer-events-none">
        Hold Middle Mouse / Left Click to Pan • Ctrl + Scroll to Zoom
      </div>
    </div>
  );
};
