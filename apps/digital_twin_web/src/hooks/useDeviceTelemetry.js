import { useState, useEffect } from 'react';

// Polls GET /api/devices/status for live device telemetry.
// Returns a map: { [deviceId]: { status, value, unit, lastSeen } }
//
// If the backend is offline or returns an error, the hook returns an empty object
// and the DeviceMarker falls back to the static status from devicesLayout.js.
//
// Future upgrade: replace the setInterval with a WebSocket message handler.
// The hook interface (deviceTelemetry object) will remain unchanged.

export function useDeviceTelemetry(enabled = true) {
  const [deviceTelemetry, setDeviceTelemetry] = useState({});

  useEffect(() => {
    if (!enabled) return;

    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/devices/status');
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'success' && data.devices) {
          setDeviceTelemetry(data.devices);
        }
      } catch {
        // Backend not yet available — static fallback in DeviceMarker
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [enabled]);

  return { deviceTelemetry };
}
