/**
 * Renders the Digital Twin device layer by grouping devices by hall, filtering
 * them by the current zone view, and switching between individual device markers
 * and hall-level count badges based on camera distance and selected hall state.
 * This component uses React Three Fiber frame updates together with DeviceMarker,
 * HallCountBadge, and hall layout metadata for LOD behavior.
 */

import React, { useState, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import DeviceMarker from './DeviceMarker';
import HallCountBadge from './HallCountBadge';
import { HALLS_LAYOUT } from '../data/hallsLayout';

const HALL_ZONE_MAP = {};
HALLS_LAYOUT.forEach(h => { HALL_ZONE_MAP[h.id] = (h.zone || '').toLowerCase(); });

// Unselected halls collapse at 30 units; selected hall stays detailed up to 60.
const LOD_THRESHOLD          = 30;
const LOD_THRESHOLD_SELECTED = 60;

function DeviceLayer({ devices, selectedHallId, currentView, deviceTelemetry }) {
  const [camDist, setCamDist] = useState(0);
  const prevDist = useRef(0);

  useFrame(({ camera }) => {
    const d = camera.position.length();
    const crossed =
      (d > LOD_THRESHOLD)          !== (prevDist.current > LOD_THRESHOLD) ||
      (d > LOD_THRESHOLD_SELECTED) !== (prevDist.current > LOD_THRESHOLD_SELECTED);
    if (crossed) setCamDist(d);
    prevDist.current = d;
  });

  // Group devices by hallId, respecting zone filter
  const hallGroups = {};
  for (const device of devices) {
    const hallZone = HALL_ZONE_MAP[device.hallId] || '';
    if (currentView !== 'all' && !hallZone.includes(currentView.toLowerCase())) continue;
    if (!hallGroups[device.hallId]) hallGroups[device.hallId] = [];
    hallGroups[device.hallId].push(device);
  }

  return (
    <group name="device-layer">
      {Object.entries(hallGroups).map(([hallId, group]) => {
        const threshold = hallId === selectedHallId ? LOD_THRESHOLD_SELECTED : LOD_THRESHOLD;
        const showIndividual = camDist <= threshold;

        if (showIndividual) {
          return group.map(device => (
            <DeviceMarker
              key={device.id}
              device={device}
              isHallSelected={selectedHallId === device.hallId}
              deviceTelemetry={deviceTelemetry}
            />
          ));
        }

        return (
          <HallCountBadge
            key={hallId}
            hallId={hallId}
            count={group.length}
          />
        );
      })}
    </group>
  );
}

export default DeviceLayer;
