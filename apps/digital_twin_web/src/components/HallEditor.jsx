/**
 * Renders the Digital Twin hall layout editor with pan and zoom controls,
 * hall selection, move and vertex edit modes, geometry editing for rectangle
 * and polygon halls, SVG import, and layout export. This component uses hall
 * editor state from HallsContext together with hallsLayout helpers and svgParser
 * utilities to update, reshape, and manage hall geometry interactively.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useHalls } from '../context/HallsContext';
import { isPolygonHall, getRectBounds, getHallCenter } from '../data/hallsLayout';
import { parseSvg } from '../utils/svgParser';

function HallEditor({ onClose }) {
  const {
    halls,
    setHalls,
    selectedHallId,
    setSelectedHallId,
    editMode,
    setEditMode,
    selectedVertexIndex,
    setSelectedVertexIndex,
    updateHall,
    updateVertex,
    addVertex,
    removeVertex,
    convertToPolygon,
    resetHalls,
    importHalls
  } = useHalls();

  const [dragState, setDragState] = useState(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const fileInputRef = useRef(null);
  const svgRef = useRef(null);

  const selectedHall = halls.find(h => h.id === selectedHallId);

  const allBounds = halls.map(h => getRectBounds(h));
  const allX = allBounds.map(b => b.x);
  const allY = allBounds.map(b => b.y);
  const minX = Math.min(...allX);
  const maxX = Math.max(...allBounds.map((b, i) => b.x + b.width));
  const minY = Math.min(...allY);
  const maxY = Math.max(...allBounds.map((b, i) => b.y + b.height));
  
  const layoutWidth = maxX - minX;
  const layoutHeight = maxY - minY;
  
  const canvasWidth = 2000;
  const canvasHeight = 1200;
  
  const scaleX = (canvasWidth - 100) / layoutWidth;
  const scaleY = (canvasHeight - 100) / layoutHeight;
  const scale = Math.min(scaleX, scaleY, 1.5);
  
  const offsetX = (canvasWidth - layoutWidth * scale) / 2 - minX * scale;
  const offsetY = (canvasHeight - layoutHeight * scale) / 2 - minY * scale;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedHallId && selectedVertexIndex !== null && editMode === 'vertex') {
          removeVertex(selectedHallId, selectedVertexIndex);
          setSelectedVertexIndex(null);
        }
      } else if (e.key === 'm' || e.key === 'M') {
        setEditMode('move');
      } else if (e.key === 'v' || e.key === 'V') {
        setEditMode('vertex');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedHallId, selectedVertexIndex, editMode, onClose, setEditMode, removeVertex, setSelectedVertexIndex]);

  useEffect(() => {
    if (editMode !== 'vertex') {
      setSelectedVertexIndex(null);
    }
  }, [editMode, setSelectedVertexIndex]);

  useEffect(() => {
    if (halls.length > 0) {
      handleFitAll();
    }
  }, []);

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(4, zoom * delta));
    
    if (svgRef.current) {
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      
      const zoomPointX = (mouseX - panOffset.x) / zoom;
      const zoomPointY = (mouseY - panOffset.y) / zoom;
      
      setPanOffset({
        x: mouseX - zoomPointX * newZoom,
        y: mouseY - zoomPointY * newZoom
      });
    }
    
    setZoom(newZoom);
  };

  const handleCanvasMouseDown = (e) => {
    if (e.target.tagName === 'svg' || e.target.classList.contains('grid-background')) {
      setIsPanning(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  };


  const handleFitAll = () => {
    const allBounds = halls.map(h => getRectBounds(h));
    const allX = allBounds.map(b => b.x);
    const allY = allBounds.map(b => b.y);
    const minX = Math.min(...allX);
    const maxX = Math.max(...allBounds.map((b) => b.x + b.width));
    const minY = Math.min(...allY);
    const maxY = Math.max(...allBounds.map((b) => b.y + b.height));
    
    const layoutWidth = maxX - minX;
    const layoutHeight = maxY - minY;
    
    const containerWidth = canvasWidth * 0.9; // 90% of container
    const containerHeight = canvasHeight * 0.9;
    
    const scaleX = containerWidth / layoutWidth;
    const scaleY = containerHeight / layoutHeight;
    const newZoom = Math.min(scaleX, scaleY, 2);
    
    setZoom(newZoom);
    setPanOffset({
      x: (canvasWidth - layoutWidth * newZoom) / 2 - minX * newZoom,
      y: (canvasHeight - layoutHeight * newZoom) / 2 - minY * newZoom
    });
  };

  const handleMouseDown = (e, hall, type, index) => {
    e.stopPropagation();
    setSelectedHallId(hall.id);
    
    if (type === 'vertex' && editMode === 'vertex') {
      setDragState({ type: 'vertex', hallId: hall.id, vertexIndex: index });
      setSelectedVertexIndex(index);
    } else if (type === 'edge' && editMode === 'vertex') {
      if (svgRef.current) {
        const svgPoint = svgRef.current.createSVGPoint();
        svgPoint.x = e.clientX;
        svgPoint.y = e.clientY;
        const transformed = svgPoint.matrixTransform(svgRef.current.getScreenCTM().inverse());
        
        const worldX = (transformed.x - panOffset.x) / zoom;
        const worldY = (transformed.y - panOffset.y) / zoom;
        
        addVertex(hall.id, index + 1, [Math.round(worldX), Math.round(worldY)]);
      }
    } else if (type === 'hall' && editMode === 'move') {
      setDragState({ type: 'hall', hallId: hall.id });
    }
    
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e) => {
    if (isPanning) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      setPanOffset({
        x: panOffset.x + dx,
        y: panOffset.y + dy
      });
      setDragStart({ x: e.clientX, y: e.clientY });
      return;
    }
    
    if (!dragState) return;

    const dx = (e.clientX - dragStart.x) / zoom;
    const dy = (e.clientY - dragStart.y) / zoom;

    if (dragState.type === 'vertex') {
      const hall = halls.find(h => h.id === dragState.hallId);
      if (hall && hall.vertices && hall.vertices[dragState.vertexIndex]) {
        const vertex = hall.vertices[dragState.vertexIndex];
        let newX = vertex[0] + dx;
        let newY = vertex[1] + dy;

        if (e.shiftKey) {
          const gridSize = 10;
          newX = Math.round(newX / gridSize) * gridSize;
          newY = Math.round(newY / gridSize) * gridSize;
        }

        updateVertex(dragState.hallId, dragState.vertexIndex, [Math.round(newX), Math.round(newY)]);
      }
    } else if (dragState.type === 'hall') {
      const hall = halls.find(h => h.id === dragState.hallId);
      if (!hall) return;
      
      if (isPolygonHall(hall) && hall.vertices) {
        const newVertices = hall.vertices.map(v => [
          Math.round(v[0] + dx),
          Math.round(v[1] + dy)
        ]);
        updateHall(dragState.hallId, { vertices: newVertices });
      } else if (!isPolygonHall(hall)) {
        updateHall(dragState.hallId, {
          x: Math.round(hall.x + dx),
          y: Math.round(hall.y + dy)
        });
      }
    }

    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setDragState(null);
    setIsPanning(false);
  };

  const handleExport = () => {
    const exportData = `export const HALLS_LAYOUT = ${JSON.stringify(halls, null, 2)};`;
    const blob = new Blob([exportData], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hallsLayout-edited.js';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSvg = async () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const importedHalls = parseSvg(text);
    
    if (importedHalls.length > 0) {
      setHalls([...halls, ...importedHalls]);
      alert(`Imported ${importedHalls.length} halls from SVG`);
    } else {
      alert('No valid halls found in SVG file');
    }
  };

  return (
    <div className="hall-editor-overlay" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      <div className="hall-editor-container">
        <div className="editor-header">
          <h2>Hall Layout Editor</h2>
          <div className="mode-switcher">
            <button 
              className={editMode === 'move' ? 'active' : ''}
              onClick={() => setEditMode('move')}
            >
              Move Mode (M)
            </button>
            <button 
              className={editMode === 'vertex' ? 'active' : ''}
              onClick={() => setEditMode('vertex')}
            >
              Vertex Mode (V)
            </button>
          </div>
          <div className="zoom-controls">
            <button onClick={() => setZoom(Math.min(4, zoom * 1.2))} title="Zoom In">+</button>
            <span className="zoom-level">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(Math.max(0.1, zoom * 0.8))} title="Zoom Out">−</button>
            <button onClick={handleFitAll} title="Fit All">⊡</button>
          </div>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

        <div className="editor-body">
          <div className="editor-canvas-container" onWheel={handleWheel}>
            <svg
              ref={svgRef}
              width={canvasWidth}
              height={canvasHeight}
              className="editor-canvas"
              onMouseDown={handleCanvasMouseDown}
              onMouseLeave={handleMouseUp}
            >
              <defs>
                <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                  <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#222" strokeWidth="1"/>
                </pattern>
              </defs>
              
              <rect 
                className="grid-background" 
                width={canvasWidth} 
                height={canvasHeight} 
                fill="url(#grid)" 
              />
              
              <g transform={`translate(${panOffset.x}, ${panOffset.y}) scale(${zoom})`}>
                {halls.map(hall => {
                  const isSelected = selectedHallId === hall.id;
                  
                  if (isPolygonHall(hall)) {
                    const pathData = hall.vertices.map((v, i) => {
                      const x = v[0];
                      const y = v[1];
                      return i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`;
                    }).join(' ') + ' Z';
                    
                    const center = getHallCenter(hall);
                    
                    return (
                      <g key={hall.id}>
                        <path
                          d={pathData}
                          fill={hall.color}
                          fillOpacity="0.5"
                          stroke={isSelected ? '#4ade80' : '#000'}
                          strokeWidth={isSelected ? 3 / zoom : 1.5 / zoom}
                      style={{ cursor: editMode === 'move' ? 'move' : 'default' }}
                      onMouseDown={(e) => handleMouseDown(e, hall, 'hall')}
                    />
                    
                    {editMode === 'vertex' && isSelected && hall.vertices.map((v, i) => {
                      const x = v[0];
                      const y = v[1];
                      const isVertexSelected = selectedVertexIndex === i;
                      
                      return (
                        <circle
                          key={`vertex-${i}`}
                          cx={x}
                          cy={y}
                          r={isVertexSelected ? 8 / zoom : 6 / zoom}
                          fill={isVertexSelected ? '#ef4444' : '#4ade80'}
                          stroke="#000"
                          strokeWidth={2 / zoom}
                          style={{ cursor: 'move' }}
                          onMouseDown={(e) => handleMouseDown(e, hall, 'vertex', i)}
                        />
                      );
                    })}
                    
                    {editMode === 'vertex' && isSelected && hall.vertices.map((v, i) => {
                      const nextI = (i + 1) % hall.vertices.length;
                      const v1 = hall.vertices[i];
                      const v2 = hall.vertices[nextI];
                      const midX = (v1[0] + v2[0]) / 2;
                      const midY = (v1[1] + v2[1]) / 2;
                      
                      return (
                        <circle
                          key={`edge-${i}`}
                          cx={midX}
                          cy={midY}
                          r={4 / zoom}
                          fill="#3b82f6"
                          stroke="#000"
                          strokeWidth={1 / zoom}
                          style={{ cursor: 'pointer' }}
                          onMouseDown={(e) => handleMouseDown(e, hall, 'edge', i)}
                        />
                      );
                    })}
                    
                    <text
                      x={center.x}
                      y={center.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#fff"
                      fontSize={14 / zoom}
                      fontWeight="bold"
                      pointerEvents="none"
                    >
                      {hall.telemetryId}
                    </text>
                  </g>
                );
              } else {
                const x = hall.x;
                const y = hall.y;
                const w = hall.width;
                const h = hall.height;
                
                return (
                  <g
                    key={hall.id}
                    transform={`translate(${x + w/2}, ${y + h/2}) rotate(${hall.rotation || 0}) translate(${-w/2}, ${-h/2})`}
                  >
                    <rect
                      x={0}
                      y={0}
                      width={w}
                      height={h}
                      fill={hall.color}
                      fillOpacity="0.5"
                      stroke={isSelected ? '#4ade80' : '#000'}
                      strokeWidth={isSelected ? 3 / zoom : 1.5 / zoom}
                      style={{ cursor: 'move' }}
                      onMouseDown={(e) => handleMouseDown(e, hall, 'hall')}
                    />
                    <text
                      x={w / 2}
                      y={h / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#fff"
                      fontSize={Math.min(14, w / 6) / zoom}
                      fontWeight="bold"
                      pointerEvents="none"
                    >
                      {hall.telemetryId}
                    </text>
                  </g>
                );
              }
            })}
            </g>
          </svg>
          </div>

          <div className="editor-controls">
            <h3>Controls</h3>
            
            <div className="mode-indicator">
              <strong>Current Mode:</strong> {editMode === 'move' ? 'Move Halls' : 'Edit Vertices'}
            </div>

            {selectedHall && (
              <div className="selected-hall-info">
                <div className="control-group">
                  <label>Selected: {selectedHall.telemetryId}</label>
                  <div className="hall-info">
                    <span>Zone: {selectedHall.zone}</span>
                    <span>Type: {isPolygonHall(selectedHall) ? 'Polygon' : 'Rectangle'}</span>
                  </div>
                </div>

                {!isPolygonHall(selectedHall) && (
                  <div className="control-group">
                    <button onClick={() => convertToPolygon(selectedHallId)} className="btn-primary">
                      Convert to Polygon
                    </button>
                  </div>
                )}

                {/* Numeric inputs for Rectangle halls */}
                {!isPolygonHall(selectedHall) && (
                  <div className="control-group numeric-inputs">
                    <h4>Rectangle Geometry:</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <label>X:</label>
                        <input
                          type="number"
                          value={Math.round(selectedHall.x)}
                          onChange={(e) => {
                            const newX = parseFloat(e.target.value) || 0;
                            updateHall(selectedHallId, { x: newX });
                          }}
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label>Y:</label>
                        <input
                          type="number"
                          value={Math.round(selectedHall.y)}
                          onChange={(e) => {
                            const newY = parseFloat(e.target.value) || 0;
                            updateHall(selectedHallId, { y: newY });
                          }}
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label>Width:</label>
                        <input
                          type="number"
                          value={Math.round(selectedHall.width)}
                          onChange={(e) => {
                            const newWidth = parseFloat(e.target.value) || 0;
                            updateHall(selectedHallId, { width: newWidth });
                          }}
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label>Height:</label>
                        <input
                          type="number"
                          value={Math.round(selectedHall.height)}
                          onChange={(e) => {
                            const newHeight = parseFloat(e.target.value) || 0;
                            updateHall(selectedHallId, { height: newHeight });
                          }}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Numeric inputs for Polygon halls */}
                {isPolygonHall(selectedHall) && (
                  <div className="control-group numeric-inputs">
                    <h4>Polygon Geometry:</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <label>Center X:</label>
                        <input
                          type="number"
                          value={Math.round(getHallCenter(selectedHall).x)}
                          onChange={(e) => {
                            const newCenterX = parseFloat(e.target.value) || 0;
                            const currentCenter = getHallCenter(selectedHall);
                            const dx = newCenterX - currentCenter.x;
                            const newVertices = selectedHall.vertices.map(v => [v[0] + dx, v[1]]);
                            updateHall(selectedHallId, { vertices: newVertices });
                          }}
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label>Center Y:</label>
                        <input
                          type="number"
                          value={Math.round(getHallCenter(selectedHall).y)}
                          onChange={(e) => {
                            const newCenterY = parseFloat(e.target.value) || 0;
                            const currentCenter = getHallCenter(selectedHall);
                            const dy = newCenterY - currentCenter.y;
                            const newVertices = selectedHall.vertices.map(v => [v[0], v[1] + dy]);
                            updateHall(selectedHallId, { vertices: newVertices });
                          }}
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label>Width:</label>
                        <input
                          type="number"
                          value={Math.round(getRectBounds(selectedHall).width)}
                          onChange={(e) => {
                            const newWidth = parseFloat(e.target.value) || 0;
                            const bounds = getRectBounds(selectedHall);
                            const center = getHallCenter(selectedHall);
                            const scaleX = newWidth / bounds.width;
                            const newVertices = selectedHall.vertices.map(v => [
                              center.x + (v[0] - center.x) * scaleX,
                              v[1]
                            ]);
                            updateHall(selectedHallId, { vertices: newVertices });
                          }}
                          style={{ width: '100%' }}
                        />
                      </div>
                      <div>
                        <label>Height:</label>
                        <input
                          type="number"
                          value={Math.round(getRectBounds(selectedHall).height)}
                          onChange={(e) => {
                            const newHeight = parseFloat(e.target.value) || 0;
                            const bounds = getRectBounds(selectedHall);
                            const center = getHallCenter(selectedHall);
                            const scaleY = newHeight / bounds.height;
                            const newVertices = selectedHall.vertices.map(v => [
                              v[0],
                              center.y + (v[1] - center.y) * scaleY
                            ]);
                            updateHall(selectedHallId, { vertices: newVertices });
                          }}
                          style={{ width: '100%' }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {editMode === 'vertex' && isPolygonHall(selectedHall) && (
                  <div className="vertex-help">
                    <p><strong>Vertex Editing:</strong></p>
                    <ul>
                      <li>Drag green circles to move vertices</li>
                      <li>Click blue circles to add vertices</li>
                      <li>Select vertex + Delete to remove</li>
                      <li>Hold Shift to snap to grid</li>
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="control-group editor-actions">
              <button onClick={handleImportSvg} className="btn-secondary">
                Import SVG
              </button>
              <button onClick={handleExport} className="btn-primary">
                Export Layout JS
              </button>
              <button onClick={resetHalls} className="btn-secondary">
                Reset to Default
              </button>
            </div>

            <div className="editor-help">
              <h4>Keyboard Shortcuts:</h4>
              <ul>
                <li><kbd>M</kbd> - Move Mode</li>
                <li><kbd>V</kbd> - Vertex Mode</li>
                <li><kbd>Delete</kbd> - Remove Vertex</li>
                <li><kbd>ESC</kbd> - Exit Editor</li>
                <li><kbd>Shift+Drag</kbd> - Snap to Grid</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".svg"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}

export default HallEditor;
