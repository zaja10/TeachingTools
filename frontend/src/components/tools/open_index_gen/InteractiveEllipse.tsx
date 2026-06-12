import React, { useRef, useState, useMemo, useCallback } from 'react';

interface InteractiveEllipseProps {
  traitX: string;
  traitY: string;
  ellipse: { x: number[]; y: number[] };
  redDot: { x: number; y: number };
  vX: number;
  vY: number;
  showIsoeconomic: boolean;
  onBoundaryClick: (x: number, y: number) => void;
  onRedDotDrag: (x: number, y: number) => void;
}

export function InteractiveEllipse({
  traitX,
  traitY,
  ellipse,
  redDot,
  vX,
  vY,
  showIsoeconomic,
  onBoundaryClick,
  onRedDotDrag
}: InteractiveEllipseProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Compute Scales
  const bounds = useMemo(() => {
    const maxX = Math.max(...ellipse.x.map(Math.abs)) * 1.2 || 1;
    const maxY = Math.max(...ellipse.y.map(Math.abs)) * 1.2 || 1;
    return { maxX, maxY };
  }, [ellipse]);

  const mapToSvg = useCallback((valX: number, valY: number, width: number, height: number) => {
    const px = ((valX + bounds.maxX) / (2 * bounds.maxX)) * width;
    const py = (1 - (valY + bounds.maxY) / (2 * bounds.maxY)) * height;
    return { px, py };
  }, [bounds]);

  const mapToData = useCallback((px: number, py: number, width: number, height: number) => {
    const valX = (px / width) * 2 * bounds.maxX - bounds.maxX;
    const valY = (1 - py / height) * 2 * bounds.maxY - bounds.maxY;
    return { valX, valY };
  }, [bounds]);

  // Convert points for SVG polygon
  const polygonPoints = useMemo(() => {
    return ellipse.x.map((xVal, i) => {
      const { px, py } = mapToSvg(xVal, ellipse.y[i], 100, 100);
      return `${px},${py}`;
    }).join(' ');
  }, [ellipse, mapToSvg]);

  // Handle Dragging
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    
    // Check if clicked near red dot
    const { px: dotPx, py: dotPy } = mapToSvg(redDot.x, redDot.y, rect.width, rect.height);
    const dist = Math.hypot(px - dotPx, py - dotPy);
    
    if (dist < 15) {
      setIsDragging(true);
      (e.target as Element).setPointerCapture(e.pointerId);
    } else {
      // Clicked somewhere else. Let's see if it's near the boundary.
      // To keep it simple, if they click the SVG (which is the boundary polygon if we put onClick there), we trigger boundary click.
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const py = Math.max(0, Math.min(e.clientY - rect.top, rect.height));
    
    const { valX, valY } = mapToData(px, py, rect.width, rect.height);
    onRedDotDrag(valX, valY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      (e.target as Element).releasePointerCapture(e.pointerId);
    }
  };

  const handleSnapClick = () => {
    if (redDot.x === 0 && redDot.y === 0) return; // Cannot snap origin
    onBoundaryClick(redDot.x, redDot.y);
  };

  // Isoeconomic Line
  let isoLine = null;
  if (showIsoeconomic && (vX !== 0 || vY !== 0)) {
    const H = vX * redDot.x + vY * redDot.y;
    // Line eq: vX * x + vY * y = H
    const pts = [];
    if (vY !== 0) {
      const y1 = (H - vX * (-bounds.maxX)) / vY;
      const y2 = (H - vX * (bounds.maxX)) / vY;
      pts.push(mapToSvg(-bounds.maxX, y1, 100, 100));
      pts.push(mapToSvg(bounds.maxX, y2, 100, 100));
    } else {
      const xVal = H / vX;
      pts.push(mapToSvg(xVal, -bounds.maxY, 100, 100));
      pts.push(mapToSvg(xVal, bounds.maxY, 100, 100));
    }
    isoLine = (
      <line 
        x1={pts[0].px} y1={pts[0].py} x2={pts[1].px} y2={pts[1].py}
        stroke="#64748b" strokeWidth="1" strokeDasharray="2,2"
        vectorEffect="non-scaling-stroke"
      />
    );
  }

  const { px: dotPx, py: dotPy } = mapToSvg(redDot.x, redDot.y, 100, 100);
  const { px: originPx, py: originPy } = mapToSvg(0, 0, 100, 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '8px' }}>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
        {traitY} vs {traitX}
      </div>
      <div style={{ width: '100%', aspectRatio: '1/1', position: 'relative' }}>
        <svg
          ref={svgRef}
          width="100%" height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ cursor: isDragging ? 'grabbing' : 'crosshair', overflow: 'visible', touchAction: 'none' }}
        >
          {/* Grid lines */}
          <line x1="0" y1={originPy} x2="100" y2={originPy} stroke="rgba(148, 163, 184, 0.3)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <line x1={originPx} y1="0" x2={originPx} y2="100" stroke="rgba(148, 163, 184, 0.3)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          
          {/* Ellipse Boundary */}
          <polygon 
            points={polygonPoints} 
            fill="rgba(251, 191, 36, 0.05)" 
            stroke="#fbbf24" 
            strokeWidth="2" 
            vectorEffect="non-scaling-stroke"
          />

          {/* Isoeconomic Line */}
          {isoLine}

          {/* Red Dot */}
          <circle 
            cx={dotPx} cy={dotPy} 
            r="4" 
            fill="#ef4444" 
            stroke="white" 
            strokeWidth="1" 
            vectorEffect="non-scaling-stroke"
            style={{ cursor: 'grab', pointerEvents: 'none' }} // Let pointer events pass to SVG for drag capture
          />
        </svg>
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem', display: 'flex', width: '100%', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span>x: {redDot.x.toFixed(2)}</span>
          <span style={{ marginLeft: '0.5rem' }}>y: {redDot.y.toFixed(2)}</span>
        </div>
        <button 
          onClick={handleSnapClick}
          disabled={redDot.x === 0 && redDot.y === 0}
          style={{
            background: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid #fbbf24',
            color: '#fbbf24',
            borderRadius: '4px',
            padding: '0.2rem 0.5rem',
            cursor: (redDot.x === 0 && redDot.y === 0) ? 'not-allowed' : 'pointer',
            fontSize: '0.65rem'
          }}
          title="Snap to Limits: The yellow ellipse represents the absolute theoretical maximum genetic gains achievable for this trait pair under your Genetic Covariance (G). Clicking this auto-calculates the exact Net Merit economic weights (v) needed to reach the boundary at your current drag angle."
        >
          Snap to Limits
        </button>
      </div>
    </div>
  );
}
