/**
 * Renders a Digital Twin device marker at the device’s mapped world position,
 * showing the device icon, status indicator, label, and hover tooltip with
 * live telemetry details. This component uses hall layout scaling data,
 * device type and status config metadata, and Drei Html overlays for UI
 * rendering inside the 3D scene.
 */

import React, { useState } from 'react';
import { Html } from '@react-three/drei';
import { DEVICE_TYPE_CONFIG, DEVICE_STATUS_CONFIG } from '../data/devicesLayout.jsx';
import { SCALE, DWTC_OUTLINE } from '../data/hallsLayout';

const BASE_Y = 3;

function DeviceMarker({ device, isHallSelected, deviceTelemetry }) {
  const [hovered, setHovered] = useState(false);

  const centerX = (DWTC_OUTLINE.minX + DWTC_OUTLINE.maxX) / 2;
  const centerY = (DWTC_OUTLINE.minY + DWTC_OUTLINE.maxY) / 2;

  const worldX = (device.svgX - centerX) * SCALE;
  const worldZ = (device.svgY - centerY) * SCALE;

  const liveStatus = deviceTelemetry?.[device.id]?.status ?? device.status;
  const typeConfig   = DEVICE_TYPE_CONFIG[device.type]   ?? DEVICE_TYPE_CONFIG.other;
  const statusConfig = DEVICE_STATUS_CONFIG[liveStatus]  ?? DEVICE_STATUS_CONFIG.online;

  const showTooltip = isHallSelected && hovered;
  const Icon = typeConfig.icon;

  return (
    <group position={[worldX, BASE_Y, worldZ]} visible={isHallSelected}>

      <Html
        position={[0, 0.5, 0]}
        center
        zIndexRange={[300, 0]}
      >
        <div
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: typeConfig.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid rgba(255,255,255,0.9)',
            boxShadow: `0 2px 10px rgba(0,0,0,0.55), 0 0 12px ${typeConfig.color}66`,
            cursor: 'pointer',
            position: 'relative',
          }}
        >
          <Icon />
          {/* Status dot — bottom-right corner */}
          <div style={{
            position: 'absolute',
            bottom: -1,
            right: -1,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: statusConfig.color,
            border: '1.5px solid #0a0a14',
          }} />
        </div>
      </Html>

      <Html
        position={[0, 2.0, 0]}
        center
        zIndexRange={[200, 0]}
        style={{ pointerEvents: 'none' }}
      >
        <div style={{
          background: 'rgba(10, 10, 20, 0.88)',
          color: '#f1f5f9',
          padding: '3px 7px',
          borderRadius: '4px',
          fontSize: 'var(--text-xs)',
          fontWeight: '600',
          whiteSpace: 'nowrap',
          border: `1px solid ${typeConfig.color}44`,
          boxShadow: `0 0 6px ${typeConfig.color}55`,
          letterSpacing: '0.02em',
        }}>
          {device.label}
        </div>
      </Html>

      {/* Tooltip on hover */}
      {showTooltip && (
        <Html
          position={[0, 3.5, 0]}
          center
          zIndexRange={[400, 0]}
        >
          <div style={{
            background: 'rgba(10, 10, 25, 0.96)',
            color: '#e2e8f0',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: 'var(--text-sm)',
            minWidth: '140px',
            border: `1px solid ${typeConfig.color}66`,
            boxShadow: `0 4px 16px rgba(0,0,0,0.6), 0 0 8px ${typeConfig.color}44`,
            pointerEvents: 'none',
          }}>
            <div style={{ color: typeConfig.color, fontWeight: '700', marginBottom: '4px' }}>
              {typeConfig.label}
            </div>
            <div style={{ marginBottom: '2px' }}>{device.label}</div>
            <div style={{ color: '#94a3b8', fontSize: 'var(--text-xs)', marginBottom: '3px' }}>
              ID: {device.id}
            </div>
            <div style={{
              display: 'inline-block',
              padding: '1px 6px',
              borderRadius: '3px',
              background: `${statusConfig.color}22`,
              color: statusConfig.color,
              fontSize: 'var(--text-xs)',
              fontWeight: '600',
            }}>
              {liveStatus.toUpperCase()}
            </div>
            {deviceTelemetry?.[device.id]?.value !== undefined && (
              <div style={{ marginTop: '4px', color: '#cbd5e1', fontSize: 'var(--text-xs)' }}>
                {deviceTelemetry[device.id].value} {deviceTelemetry[device.id].unit ?? ''}
              </div>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}

export default DeviceMarker;
