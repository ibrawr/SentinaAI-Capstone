import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useHalls } from '../context/HallsContext';
import { HALLS_LAYOUT, getHallCenter, SCALE, DWTC_OUTLINE } from '../data/hallsLayout';

const DEFAULT_CAMERA_POS = new THREE.Vector3(30, 40, 30);
const DEFAULT_TARGET = new THREE.Vector3(0, 0, 0);
const LERP_FACTOR = 0.07;
const ARRIVE_THRESHOLD = 0.05;

function HallFocusCamera() {
  const { selectedHallId } = useHalls();
  const { camera, controls } = useThree();

  const centerX = (DWTC_OUTLINE.minX + DWTC_OUTLINE.maxX) / 2;
  const centerY = (DWTC_OUTLINE.minY + DWTC_OUTLINE.maxY) / 2;

  const state = useRef({
    targetPos: DEFAULT_CAMERA_POS.clone(),
    targetLookAt: DEFAULT_TARGET.clone(),
    animating: false,
  });

  useEffect(() => {
    if (!controls) return;
    const stopAnimation = () => { state.current.animating = false; };
    controls.addEventListener('start', stopAnimation);
    return () => controls.removeEventListener('start', stopAnimation);
  }, [controls]);

  useEffect(() => {
    if (!selectedHallId) {
      state.current.targetPos.copy(DEFAULT_CAMERA_POS);
      state.current.targetLookAt.copy(DEFAULT_TARGET);
      state.current.animating = true;
      return;
    }

    const hall = HALLS_LAYOUT.find(h => h.id === selectedHallId);
    if (!hall) return;

    const center = getHallCenter(hall);
    const worldX = (center.x - centerX) * SCALE;
    const worldZ = (center.y - centerY) * SCALE;

    state.current.targetPos.set(worldX, 28, worldZ + 18);
    state.current.targetLookAt.set(worldX, 0, worldZ);
    state.current.animating = true;
  }, [selectedHallId, centerX, centerY]);

  useFrame(() => {
    if (!state.current.animating) return;

    camera.position.lerp(state.current.targetPos, LERP_FACTOR);

    if (controls) {
      controls.target.lerp(state.current.targetLookAt, LERP_FACTOR);
      controls.update();
    }

    const posClose = camera.position.distanceTo(state.current.targetPos) < ARRIVE_THRESHOLD;
    const lookClose = controls
      ? controls.target.distanceTo(state.current.targetLookAt) < ARRIVE_THRESHOLD
      : true;

    if (posClose && lookClose) {
      camera.position.copy(state.current.targetPos);
      if (controls) {
        controls.target.copy(state.current.targetLookAt);
        controls.update();
      }
      state.current.animating = false;
    }
  });

  return null;
}

export default HallFocusCamera;
