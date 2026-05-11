import React from 'react';
import { Html } from '@react-three/drei';
import { HALLS_LAYOUT, getHallCenter, SCALE, HALL_HEIGHT, DWTC_OUTLINE } from '../data/hallsLayout';

function HallCountBadge({ hallId, count }) {
  const hall = HALLS_LAYOUT.find(h => h.id === hallId);
  if (!hall) return null;

  const centerX = (DWTC_OUTLINE.minX + DWTC_OUTLINE.maxX) / 2;
  const centerY = (DWTC_OUTLINE.minY + DWTC_OUTLINE.maxY) / 2;
  const hallCenter = getHallCenter(hall);

  const worldX = (hallCenter.x - centerX) * SCALE;
  const worldZ = (hallCenter.y - centerY) * SCALE;

  return (
    <group position={[worldX, HALL_HEIGHT + 1, worldZ]}>
      <Html center zIndexRange={[100, 0]}>
        <div style={{
          background: 'rgba(15, 15, 25, 0.85)',
          color: '#f1f5f9',
          border: '1.5px solid rgba(255,255,255,0.25)',
          borderRadius: '12px',
          padding: '3px 8px',
          fontSize: 'var(--text-sm)',
          fontWeight: '700',
          whiteSpace: 'nowrap',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          {count}
        </div>
      </Html>
    </group>
  );
}

export default HallCountBadge;
