import React, { createContext, useContext, useState, useCallback } from 'react';
import { HALLS_LAYOUT } from '../data/hallsLayout';

const HallsContext = createContext(null);

export function HallsProvider({ children }) {
  const [halls, setHalls] = useState([...HALLS_LAYOUT]);
  const [selectedHallId, setSelectedHallId] = useState(null);
  const [editMode, setEditMode] = useState('move');
  const [selectedVertexIndex, setSelectedVertexIndex] = useState(null);

  const updateHall = useCallback((hallId, updates) => {
    setHalls(prev => prev.map(h => 
      h.id === hallId ? { ...h, ...updates } : h
    ));
  }, []);

  const updateVertex = useCallback((hallId, vertexIndex, newPosition) => {
    setHalls(prev => prev.map(h => {
      if (h.id !== hallId || !h.vertices) return h;
      const newVertices = [...h.vertices];
      newVertices[vertexIndex] = newPosition;
      return { ...h, vertices: newVertices };
    }));
  }, []);

  const addVertex = useCallback((hallId, insertIndex, position) => {
    setHalls(prev => prev.map(h => {
      if (h.id !== hallId || !h.vertices) return h;
      const newVertices = [
        ...h.vertices.slice(0, insertIndex),
        position,
        ...h.vertices.slice(insertIndex)
      ];
      return { ...h, vertices: newVertices };
    }));
  }, []);

  const removeVertex = useCallback((hallId, vertexIndex) => {
    setHalls(prev => prev.map(h => {
      if (h.id !== hallId || !h.vertices || h.vertices.length <= 3) return h;
      const newVertices = h.vertices.filter((_, i) => i !== vertexIndex);
      return { ...h, vertices: newVertices };
    }));
  }, []);

  const convertToPolygon = useCallback((hallId) => {
    setHalls(prev => prev.map(h => {
      if (h.id !== hallId || h.vertices) return h;
      
      const vertices = [
        [h.x, h.y],
        [h.x + h.width, h.y],
        [h.x + h.width, h.y + h.height],
        [h.x, h.y + h.height]
      ];

      if (h.rotation && h.rotation !== 0) {
        const centerX = h.x + h.width / 2;
        const centerY = h.y + h.height / 2;
        const angle = (h.rotation * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);

        const rotatedVertices = vertices.map(([x, y]) => {
          const dx = x - centerX;
          const dy = y - centerY;
          return [
            Math.round(centerX + dx * cos - dy * sin),
            Math.round(centerY + dx * sin + dy * cos)
          ];
        });
        
        return {
          id: h.id,
          telemetryId: h.telemetryId,
          zone: h.zone,
          vertices: rotatedVertices,
          color: h.color
        };
      }

      return {
        id: h.id,
        telemetryId: h.telemetryId,
        zone: h.zone,
        vertices,
        color: h.color
      };
    }));
  }, []);

  const resetHalls = useCallback(() => {
    setHalls([...HALLS_LAYOUT]);
    setSelectedHallId(null);
    setSelectedVertexIndex(null);
  }, []);

  const importHalls = useCallback((newHalls) => {
    setHalls(newHalls);
  }, []);

  const value = {
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
  };

  return (
    <HallsContext.Provider value={value}>
      {children}
    </HallsContext.Provider>
  );
}

export function useHalls() {
  const context = useContext(HallsContext);
  if (!context) {
    throw new Error('useHalls must be used within HallsProvider');
  }
  return context;
}
