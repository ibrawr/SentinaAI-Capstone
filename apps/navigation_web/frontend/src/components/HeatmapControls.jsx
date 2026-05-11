import React from 'react';

export default function HeatmapControls({
  enabled,
  setEnabled,
  mode,
  setMode,
  radius,
  setRadius,
  cellSize,
  setCellSize,
  alphaScale,
  setAlphaScale,
  booths,
  selectedBoothId,
  setSelectedBoothId,
}) {
  return (
    <div style={{
      position: 'absolute',
      top: 12,
      right: 12,
      zIndex: 9999,
      background: 'rgba(0,0,0,0.7)',
      color: '#fff',
      padding: 12,
      borderRadius: 10,
      width: 280,
      fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial',
      fontSize: 12,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Heatmap</strong>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span>{enabled ? 'On' : 'Off'}</span>
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
        </label>
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ width: 70 }}>Mode</span>
          <select value={mode} onChange={e => setMode(e.target.value)} style={{ flex: 1 }}>
            <option value="global">Global</option>
            <option value="booth">Booth</option>
          </select>
        </label>
      </div>

      {mode === 'booth' && (
        <div style={{ marginTop: 10 }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ width: 70 }}>Booth</span>
            <select
              value={selectedBoothId ?? ''}
              onChange={e => setSelectedBoothId(e.target.value || null)}
              style={{ flex: 1 }}
            >
              <option value="">Select…</option>
              {booths.map(b => (
                <option key={b.id} value={b.id}>{b.name ?? b.id}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ width: 70 }}>Radius</span>
          <input
            type="range"
            min={10}
            max={140}
            value={radius}
            onChange={e => setRadius(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ width: 36, textAlign: 'right' }}>{radius}</span>
        </label>
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ width: 70 }}>Cell</span>
          <input
            type="range"
            min={4}
            max={30}
            value={cellSize}
            onChange={e => setCellSize(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ width: 36, textAlign: 'right' }}>{cellSize}</span>
        </label>
      </div>

      <div style={{ marginTop: 10 }}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ width: 70 }}>Intensity</span>
          <input
            type="range"
            min={0.2}
            max={2.5}
            step={0.1}
            value={alphaScale}
            onChange={e => setAlphaScale(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ width: 36, textAlign: 'right' }}>{alphaScale.toFixed(1)}</span>
        </label>
      </div>

      <div style={{ marginTop: 10, opacity: 0.85 }}>
        <div>Tip: Global shows venue-wide density. Booth mode masks heatmap to the selected booth polygon.</div>
      </div>
    </div>
  );
}
