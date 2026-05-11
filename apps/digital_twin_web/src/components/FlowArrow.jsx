import React, { useRef, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

const TUBE_RADIUS = 0.15;
const TUBE_SEGMENTS = 32;
const PULSE_RADIUS = 0.35;
const CONE_HEIGHT = 0.8;
const CONE_RADIUS = 0.3;

export default function FlowArrow({ from, to, color = '#10b981' }) {
  const pulseRef = useRef();
  const tRef = useRef(0);

  const { tubeGeo, curve, conePosition, coneQuat } = useMemo(() => {
    const a = new THREE.Vector3(...from);
    const b = new THREE.Vector3(...to);
    const mid = a.clone().lerp(b, 0.5);
    mid.y += 2;

    const c = new THREE.QuadraticBezierCurve3(a, mid, b);
    const geo = new THREE.TubeGeometry(c, TUBE_SEGMENTS, TUBE_RADIUS, 8, false);

    const endPt = c.getPoint(1);
    const tangent = c.getTangent(1).normalize();
    const quat = new THREE.Quaternion();
    quat.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);

    return { tubeGeo: geo, curve: c, conePosition: endPt, coneQuat: quat };
  }, [from, to]);

  const coneGeo = useMemo(() => new THREE.ConeGeometry(CONE_RADIUS, CONE_HEIGHT, 8), []);
  const pulseGeo = useMemo(() => new THREE.SphereGeometry(PULSE_RADIUS, 8, 8), []);

  useFrame((_, delta) => {
    tRef.current = (tRef.current + delta * 0.4) % 1;
    if (pulseRef.current) {
      const pt = curve.getPoint(tRef.current);
      pulseRef.current.position.set(pt.x, pt.y, pt.z);
    }
  });

  return (
    <group>
      {/* Base tube — dim */}
      <mesh geometry={tubeGeo}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.4}
          transparent
          opacity={0.5}
          depthWrite={false}
        />
      </mesh>

      {/* Sliding pulse sphere */}
      <mesh ref={pulseRef} geometry={pulseGeo}>
        <meshStandardMaterial
          color="#ffffff"
          emissive={color}
          emissiveIntensity={1.2}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Arrowhead cone */}
      <mesh
        geometry={coneGeo}
        position={[conePosition.x, conePosition.y, conePosition.z]}
        quaternion={coneQuat}
      >
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.6}
        />
      </mesh>
    </group>
  );
}
