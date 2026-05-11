/**
 * Renders an individual hall mesh in the Digital Twin scene, applying telemetry-
 * driven coloring, glow intensity, transparency, forecast styling, selection
 * animation, and hall labeling. This component supports both rectangular and
 * polygon hall geometry using hallsLayout metadata, matches hall telemetry data,
 * and uses React Three Fiber, Three.js geometry, and Drei Text/Html overlays
 * for interactive 3D hall rendering.
 */

import React, { useState, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text, Html } from '@react-three/drei';
import { SCALE, HALL_HEIGHT, isPolygonHall } from '../data/hallsLayout';

const findMatchingTelemetry = (hall, telemetryData) => {
  if (!telemetryData || Object.keys(telemetryData).length === 0) return {};
  if (telemetryData[hall.id]) return telemetryData[hall.id];
  if (telemetryData[hall.telemetryId]) return telemetryData[hall.telemetryId];

  const normId = String(hall.id).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const normTel = String(hall.telemetryId).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  for (const key in telemetryData) {
    const normKey = String(key).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

    if (normKey === normId || normKey === normTel) {
      return telemetryData[key];
    }

    if (hall.zone && hall.zone.toLowerCase() === 'central') {
      if (normKey === `central${normId}`) return telemetryData[key];
    }
  }

  return {};
};

function HallMesh({ hall, centerX, centerY, onClick, telemetryData, currentView, isSelected, anyHallSelected, currentLayer = 'occupancy', simMode }) {
  const [hovered, setHovered] = useState(false);

  const data = findMatchingTelemetry(hall, telemetryData);

  let blockColor = '#4ade80';
  let glowIntensity = 0.2;

  if (currentLayer === 'occupancy') {
    const rate = data.occupancyRatio || (data.occupancy || 0) / 100;
    if (rate < 0.25) blockColor = '#4ade80';
    else if (rate < 0.60) blockColor = '#fbbf24';
    else if (rate < 0.80) blockColor = '#f97316';
    else blockColor = '#ef4444';
    glowIntensity = 0.2 + (rate * 0.3);

  } else if (currentLayer === 'co2') {
    const co2 = data.co2 || 400;
    if (co2 < 600) blockColor = '#4ade80';
    else if (co2 < 800) blockColor = '#fbbf24';
    else if (co2 < 1000) blockColor = '#f97316';
    else blockColor = '#9333ea';
    glowIntensity = 0.2 + ((co2 - 400) / 1000 * 0.5);

  } else if (currentLayer === 'aiAction') {
    if (data.isAnomaly) {
      blockColor = '#ff0000';
      glowIntensity = 0.8;
    } else {
      blockColor = '#1f2937';
      glowIntensity = 0.05;
    }
  } else if (currentLayer === 'sustainability') {
    const co2Footprint = data.co2 || 400;
    if (co2Footprint > 800) {
      blockColor = '#2563eb';
      glowIntensity = 0.4;
    } else if (co2Footprint < 500) { blockColor = '#22c55e'; glowIntensity = 0.1; }
    else if (co2Footprint < 700) { blockColor = '#94a3b8'; glowIntensity = 0.1; }
    else if (co2Footprint < 900) { blockColor = '#475569'; glowIntensity = 0.1; }
    else { blockColor = '#0f172a'; glowIntensity = 0.1; }
  }

  if (isSelected) {
    blockColor = '#3b82f6';
    glowIntensity = 0.6;
  }

  const isTransparent = isSelected || anyHallSelected;
  const opacity = isSelected ? 0.35 : anyHallSelected ? 0.55 : 1.0;

  const geometry = useMemo(() => {
    if (isPolygonHall(hall)) {
      const shape = new THREE.Shape();
      hall.vertices.forEach((vertex, i) => {
        const x = (vertex[0] - centerX) * SCALE;
        const z = (vertex[1] - centerY) * SCALE;
        if (i === 0) shape.moveTo(x, z);
        else shape.lineTo(x, z);
      });
      shape.closePath();
      return new THREE.ExtrudeGeometry(shape, { depth: HALL_HEIGHT, bevelEnabled: false });
    } else {
      const width = hall.width * SCALE;
      const depth = hall.height * SCALE;
      return new THREE.BoxGeometry(width, HALL_HEIGHT, depth);
    }
  }, [hall, centerX, centerY]);

  const basePosition = useMemo(() => {
    if (isPolygonHall(hall)) return [0, HALL_HEIGHT / 2, 0];
    const x = (hall.x + hall.width / 2 - centerX) * SCALE;
    const z = (hall.y + hall.height / 2 - centerY) * SCALE;
    return [x, HALL_HEIGHT / 2, z];
  }, [hall, centerX, centerY]);

  const rotation = useMemo(() => {
    if (isPolygonHall(hall)) return [0, 0, 0];
    return [0, (hall.rotation || 0) * Math.PI / 180, 0];
  }, [hall]);

  const groupRef = useRef();
  const meshRef = useRef();
  const targetY = isSelected ? basePosition[1] + 2 : basePosition[1];
  const isForecast = simMode === 'forecast' && data.isForecast;

  const edgesGeo = useMemo(() => {
    if (!isForecast) return null;
    return new THREE.EdgesGeometry(geometry);
  }, [geometry, isForecast]);

  useFrame(() => {
    if (!groupRef.current) return;
    groupRef.current.position.y = THREE.MathUtils.lerp(
      groupRef.current.position.y,
      targetY,
      0.1
    );
    if (isForecast && meshRef.current) {
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() * 0.003);
      meshRef.current.material.opacity = 0.4 + pulse * 0.4;
    }
  });

  if (currentView !== 'all' && (!hall.zone || !hall.zone.toLowerCase().includes(currentView))) {
    return null;
  }

  return (
    <group position={[basePosition[0], 0, basePosition[2]]} rotation={rotation}>
      <group ref={groupRef} position={[0, basePosition[1], 0]}>
        <mesh
          ref={meshRef}
          geometry={geometry}
          castShadow
          receiveShadow
          onPointerOver={(e) => { e.stopPropagation(); setHovered(true); }}
          onPointerOut={(e) => { e.stopPropagation(); setHovered(false); }}
          onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
          scale={hovered ? [1.03, 1.05, 1.03] : [1, 1, 1]}
        >
          <meshStandardMaterial
            color={blockColor}
            emissive={blockColor}
            emissiveIntensity={glowIntensity}
            roughness={0.7}
            metalness={0.3}
            transparent={isTransparent || isForecast}
            opacity={isForecast ? 0.6 : opacity}
            depthWrite={!(isTransparent || isForecast)}
          />
        </mesh>
        {isForecast && edgesGeo && (
          <lineSegments geometry={edgesGeo}>
            <lineDashedMaterial color="#f59e0b" dashSize={0.4} gapSize={0.25} linewidth={1} />
          </lineSegments>
        )}
      </group>

      <Text
        position={[0, HALL_HEIGHT + 0.2, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.8}
        color="#1e293b"
        fontWeight="bold"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.03}
        outlineColor="#ffffff"
        depthOffset={-1}
      >
        {hall.id.replace(/hall/i, ' HALL ').toUpperCase()}
      </Text>

      {data.isAnomaly && currentLayer === 'aiAction' && (
        <Html
          position={[0, HALL_HEIGHT + 3, 0]}
          center
          zIndexRange={[100, 0]}
        >
          <div className="device-alert">
            ⚠️ BREACH: {data.compromisedDevice || 'IOT_SENSOR_CRITICAL'}
          </div>
        </Html>
      )}
    </group>
  );
}

export default HallMesh;
