import React, { useEffect, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Text } from '@react-three/drei';
import HallMesh from './HallMesh';
import DeviceLayer from './DeviceLayer';
import HallFocusCamera from './HallFocusCamera';
import FlowArrowLayer from './FlowArrowLayer';
import { useHalls } from '../context/HallsContext';
import { useTheme } from '../context/ThemeContext';
import { SCALE, HALL_HEIGHT, DWTC_OUTLINE } from '../data/hallsLayout';

function FrameLimiter() {
  const { invalidate } = useThree();

  useEffect(() => {
    const interval = setInterval(() => {
      invalidate();
    }, 1000 / 24);

    return () => clearInterval(interval);
  }, [invalidate]);

  return null;
}

function Scene3D({ telemetryData, currentView, currentLayer, devices, deviceTelemetry, simMode }) {
  const { halls, selectedHallId, setSelectedHallId } = useHalls();
  const { theme } = useTheme();
  const controlsRef = useRef();

  const centerX = (DWTC_OUTLINE.minX + DWTC_OUTLINE.maxX) / 2;
  const centerY = (DWTC_OUTLINE.minY + DWTC_OUTLINE.maxY) / 2;

  const anyHallSelected = !!selectedHallId;

  const sceneColors = {
    dark: {
      background: '#0a0a0a',
      ambient: 0.6,
      directional: 0.8,
      floor: '#0d0d0d',
      grid: 0x1a1a1a,
      gridFaint: 0x111111
    },
    light: {
      background: '#e8e8e8',
      ambient: 0.8,
      directional: 1.0,
      floor: '#f5f5f5',
      grid: 0xd0d0d0,
      gridFaint: 0xe0e0e0
    }
  };

  const colors = sceneColors[theme] || sceneColors.dark;

  return (
    <Canvas
      shadows
      frameloop="demand"
      gl={{ preserveDrawingBuffer: true }}
      style={{
        width: '100vw',
        height: '100vh',
        background: colors.background,
        transition: 'background-color 0.3s ease'
      }}
    >
      <FrameLimiter />

      <PerspectiveCamera makeDefault position={[30, 40, 30]} fov={60} />
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.05}
        minDistance={15}
        maxDistance={100}
        maxPolarAngle={Math.PI / 2}
      />

      <HallFocusCamera />

      <ambientLight intensity={colors.ambient} />
      <directionalLight
        position={[50, 80, 50]}
        intensity={colors.directional}
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-30, 40, -30]} intensity={0.3} />

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color={colors.floor} roughness={0.9} />
      </mesh>

      {halls.map((hall) => {
        const x = hall.x - centerX;
        const z = hall.z - centerY;

        return (
          <group key={hall.id}>
            <HallMesh
              hall={hall}
              centerX={centerX}
              centerY={centerY}
              onClick={() => setSelectedHallId(selectedHallId === hall.id ? null : hall.id)}
              telemetryData={telemetryData}
              currentView={currentView}
              isSelected={selectedHallId === hall.id}
              anyHallSelected={anyHallSelected}
              currentLayer={currentLayer}
              simMode={simMode}
            />

            <Text
              position={[x, HALL_HEIGHT + 1, z]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={2.5}
              color={theme === 'dark' ? '#ffffff' : '#1a1a1a'}
              anchorX="center"
              anchorY="middle"
              fontWeight="bold"
              outlineWidth={0.2}
              outlineColor={theme === 'dark' ? '#000000' : '#ffffff'}
              depthTest={false}
              renderOrder={999}
            >
              {hall.label || hall.id.replace('hall', ' HALL ').toUpperCase()}
            </Text>
          </group>
        );
      })}

      {devices && devices.length > 0 && (
        <DeviceLayer
          devices={devices}
          selectedHallId={selectedHallId}
          currentView={currentView}
          deviceTelemetry={deviceTelemetry}
        />
      )}

      <FlowArrowLayer telemetryData={telemetryData} currentLayer={currentLayer} />

      <gridHelper
        args={[200, 50, colors.grid, colors.gridFaint]}
        position={[0, 0, 0]}
      />
    </Canvas>
  );
}

export default Scene3D;
