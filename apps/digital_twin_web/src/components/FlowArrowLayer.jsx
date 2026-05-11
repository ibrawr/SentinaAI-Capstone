import React, { useMemo } from 'react';
import FlowArrow from './FlowArrow';
import { useHalls } from '../context/HallsContext';
import { getHallWorldPosition } from '../data/hallsLayout';

const ARROW_Y = 0.5;
const TARGET_COUNT = 3;

function findTelemetry(hall, telemetryData) {
  if (!telemetryData) return {};
  return telemetryData[hall.id] || telemetryData[hall.telemetryId] || {};
}

export default function FlowArrowLayer({ telemetryData, currentLayer }) {
  const { halls } = useHalls();

  const arrows = useMemo(() => {
    if (currentLayer !== 'aiAction' || !telemetryData) return [];

    const result = [];
    const anomalousHalls = halls.filter(h => {
      const d = findTelemetry(h, telemetryData);
      return d.isAnomaly && d.aiAction && /route|redirect|dispatch/i.test(d.aiAction);
    });

    for (const srcHall of anomalousHalls) {
      const srcPos = getHallWorldPosition(srcHall);

      const sameZone = halls.filter(h => h.zone === srcHall.zone && h.id !== srcHall.id);
      const pool = sameZone.length >= TARGET_COUNT ? sameZone : halls.filter(h => h.id !== srcHall.id);

      const targets = pool
        .map(h => ({ hall: h, occ: (findTelemetry(h, telemetryData).occupancyRatio || 0) }))
        .sort((a, b) => a.occ - b.occ)
        .slice(0, TARGET_COUNT);

      for (const { hall: tgtHall } of targets) {
        const tgtPos = getHallWorldPosition(tgtHall);
        result.push({
          key: `${srcHall.id}->${tgtHall.id}`,
          from: [srcPos.x, ARROW_Y, srcPos.z],
          to: [tgtPos.x, ARROW_Y, tgtPos.z],
        });
      }
    }

    return result;
  }, [halls, telemetryData, currentLayer]);

  if (arrows.length === 0) return null;

  return (
    <group>
      {arrows.map(a => (
        <FlowArrow key={a.key} from={a.from} to={a.to} />
      ))}
    </group>
  );
}
