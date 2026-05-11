/**
 * Renders the Digital Twin control panel for zone views, simulation modes,
 * playback controls, manual data injection, forecast horizon settings, layer
 * selection, snapshot export, and theme switching. This component uses shared
 * theme context, manages UI state for live, history, simulator, and forecast
 * modes, and triggers callbacks that control the Digital Twin scene behavior.
 */

import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '../context/ThemeContext';

const ALL_HALLS = [
  { id: 'northhall1', label: 'North Hall 1' }, { id: 'northhall2', label: 'North Hall 2' },
  { id: 'northhall3', label: 'North Hall 3' }, { id: 'northhall4', label: 'North Hall 4' },
  { id: 'northhall5', label: 'North Hall 5' }, { id: 'northhall6', label: 'North Hall 6' },
  { id: 'easthall1', label: 'East Hall 1' }, { id: 'easthall2', label: 'East Hall 2' },
  { id: 'easthall3', label: 'East Hall 3' }, { id: 'easthall4', label: 'East Hall 4' },
  { id: 'southhall1', label: 'South Hall 1' }, { id: 'southhall2', label: 'South Hall 2' },
  { id: 'southhall3', label: 'South Hall 3' }, { id: 'southhall4', label: 'South Hall 4' },
  { id: 'southhall5', label: 'South Hall 5' }, { id: 'southhall6', label: 'South Hall 6' },
  { id: 'hall1', label: 'Central Hall 1' }, { id: 'hall2', label: 'Central Hall 2' },
  { id: 'hall3', label: 'Central Hall 3' }, { id: 'hall4', label: 'Central Hall 4' },
  { id: 'hall5', label: 'Central Hall 5' }, { id: 'hall6', label: 'Central Hall 6' },
  { id: 'hall7', label: 'Central Hall 7' }, { id: 'hall8', label: 'Central Hall 8' },
  { id: 'hall9', label: 'Central Hall 9' }, { id: 'hall10', label: 'Central Hall 10' }
];

function Controls({
  currentView, onViewChange, isEditMode, onToggleEdit,
  currentLayer, onLayerChange, simMode, setSimMode,
  timeIndex, setTimeIndex, forecastHours, setForecastHours, injectData
}) {
  const { theme, toggleTheme } = useTheme();

  const views = [
    { id: 'all',     label: 'View All', title: 'Show all zones' },
    { id: 'north',   label: 'North',    title: 'Filter to North zone' },
    { id: 'east',    label: 'East',     title: 'Filter to East zone' },
    { id: 'south',   label: 'South',    title: 'Filter to South zone' },
    { id: 'central', label: 'Central',  title: 'Filter to Central zone' },
  ];

  const [injectHall, setInjectHall] = useState('hall1');
  const [injectOcc,  setInjectOcc]  = useState(95);
  const [injectCO2,  setInjectCO2]  = useState(800);

  // Toast state
  const [toast, setToast] = useState(null); // { msg, type }
  const toastTimer = useRef(null);

  const showToast = (msg, type = 'success') => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // History play/pause
  const [playing, setPlaying] = useState(false);
  const playInterval = useRef(null);

  const togglePlay = () => {
    if (playing) {
      clearInterval(playInterval.current);
      setPlaying(false);
    } else {
      setPlaying(true);
      playInterval.current = setInterval(() => {
        setTimeIndex(prev => {
          if (prev >= 24) {
            clearInterval(playInterval.current);
            setPlaying(false);
            return 24;
          }
          return prev + 1;
        });
      }, 600);
    }
  };

  // Stop playback when mode changes away from history
  useEffect(() => {
    if (simMode !== 'history') {
      clearInterval(playInterval.current);
      setPlaying(false);
    }
  }, [simMode]);

  useEffect(() => () => clearInterval(playInterval.current), []);

  const handleExportSnapshot = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) { showToast('No canvas found', 'error'); return; }
    const link = document.createElement('a');
    link.download = `SentinaAI-Snapshot-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast('Snapshot saved!');
  };

  const handleInject = () => {
    const occ = Math.min(100, Math.max(0, Number(injectOcc)));
    const co2 = Math.max(0, Number(injectCO2));
    injectData(injectHall, occ, co2);
    showToast(`Injected into ${injectHall}`);
  };

  const formatHour = (h) => {
    const suffix = h < 12 ? 'AM' : 'PM';
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${display}:00 ${suffix}`;
  };

  return (
    <div className="controls-wrapper" style={{
      position: 'fixed', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 10000, display: 'flex', flexDirection: 'column', gap: '12px',
      background: 'var(--controls-bg)', padding: '20px', borderRadius: '12px',
      border: '1px solid var(--border-color)', backdropFilter: 'blur(15px)', width: 'fit-content'
    }}>

      {/* Toast notification */}
      {toast && (
        <div style={{
          position: 'absolute', top: '-44px', left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'error' ? '#ef4444' : '#10b981',
          color: '#fff', padding: '8px 16px', borderRadius: '8px',
          fontSize: 'var(--text-sm)', fontWeight: 600, whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
          animation: 'slideInRight 0.18s ease-out both',
          pointerEvents: 'none',
        }}>
          {toast.msg}
        </div>
      )}

      {/* Top Row: Navigation + Modes + Theme Toggle */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {views.map((v) => (
          <button key={v.id}
            className={currentView === v.id && !isEditMode ? 'active' : ''}
            onClick={() => onViewChange(v.id)}
            title={v.title}
            style={{ padding: '8px 12px', fontSize: 'var(--text-sm)' }}>
            {v.label}
          </button>
        ))}
        <div style={{ width: '1px', height: '20px', background: 'var(--divider-color)', margin: '0 8px' }} />
        <button
          onClick={() => setSimMode('live')}
          title="Live IoT — real-time sensor data"
          style={{ background: simMode === 'live' ? '#10b981' : 'var(--button-inactive-bg)', color: '#fff', border: '1px solid var(--border-color)', padding: '8px 14px', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
          Live IoT
        </button>
        <button
          onClick={() => setSimMode('history')}
          title="History — scrub through the last 24 hours"
          style={{ background: simMode === 'history' ? '#9333ea' : 'var(--button-inactive-bg)', color: '#fff', border: '1px solid var(--border-color)', padding: '8px 14px', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
          History
        </button>
        <button
          onClick={() => setSimMode('sandbox')}
          title="Simulator — manually inject sensor data"
          style={{ background: simMode === 'sandbox' ? '#ef4444' : 'var(--button-inactive-bg)', color: '#fff', border: '1px solid var(--border-color)', padding: '8px 14px', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
          Simulator
        </button>
        <button
          onClick={() => setSimMode('forecast')}
          title="Forecast — predict occupancy 1-4 hours ahead"
          style={{ background: simMode === 'forecast' ? '#f59e0b' : 'var(--button-inactive-bg)', color: '#fff', border: '1px solid var(--border-color)', padding: '8px 14px', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
          Forecast
        </button>
        <div style={{ width: '1px', height: '20px', background: 'var(--divider-color)', margin: '0 8px' }} />
        <button
          className={isEditMode ? 'active btn-edit' : 'btn-edit'}
          onClick={onToggleEdit}
          title={isEditMode ? 'Exit the layout editor' : 'Open the layout editor'}
          style={{ padding: '8px 14px', fontSize: 'var(--text-sm)' }}>
          {isEditMode ? 'Exit Editor' : 'Edit Layout'}
        </button>
        <div style={{ width: '1px', height: '20px', background: 'var(--divider-color)', margin: '0 8px' }} />
        <button
          onClick={toggleTheme}
          className="theme-toggle"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          style={{ padding: '8px 14px', fontSize: 'var(--text-md)', background: 'var(--button-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s' }}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </div>

      {/* HISTORY SCRUBBER */}
      {simMode === 'history' && (
        <div style={{ borderTop: '1px solid #9333ea', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#9333ea', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
            <span>HISTORY LOG (24H)</span>
            <span>{formatHour(timeIndex)}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={togglePlay}
              title={playing ? 'Pause playback' : 'Auto-play through 24 hours'}
              style={{ background: '#9333ea', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 10px', fontSize: 'var(--text-base)', cursor: 'pointer', flexShrink: 0 }}>
              {playing ? '⏸' : '▶'}
            </button>
            <input
              type="range" min="0" max="24" value={timeIndex}
              onChange={(e) => { if (playing) { clearInterval(playInterval.current); setPlaying(false); } setTimeIndex(parseInt(e.target.value)); }}
              style={{ width: '100%', accentColor: '#9333ea', cursor: 'pointer' }}
            />
          </div>
        </div>
      )}

      {/* DATA INJECTOR */}
      {simMode === 'sandbox' && (
        <div style={{ borderTop: '1px solid #ef4444', paddingTop: '12px', display: 'flex', gap: '10px', alignItems: 'center' }}>
          <span style={{ color: '#ef4444', fontSize: 'var(--text-xs)', fontWeight: 700, marginRight: '10px' }}>DATA INJECTOR:</span>
          <select value={injectHall} onChange={(e) => setInjectHall(e.target.value)}
            style={{ background: 'var(--input-bg)', color: 'var(--text-primary)', padding: '6px', border: '1px solid var(--border-color)', borderRadius: '4px', fontSize: 'var(--text-sm)' }}>
            {ALL_HALLS.map((hall) => <option key={hall.id} value={hall.id}>{hall.label}</option>)}
          </select>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }} title="Occupancy percentage (0–100)">Occ %:</label>
            <input
              type="number" value={injectOcc} min="0" max="100"
              onChange={(e) => setInjectOcc(Math.min(100, Math.max(0, Number(e.target.value))))}
              style={{ width: '50px', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '4px', fontSize: 'var(--text-sm)' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <label style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }} title="CO₂ level in ppm (≥ 0)">CO₂:</label>
            <input
              type="number" value={injectCO2} min="0"
              onChange={(e) => setInjectCO2(Math.max(0, Number(e.target.value)))}
              style={{ width: '60px', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '4px', fontSize: 'var(--text-sm)' }}
            />
          </div>
          <button
            onClick={handleInject}
            title="Inject these values into the selected hall"
            style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '6px 12px', fontSize: 'var(--text-sm)', fontWeight: 700, borderRadius: '4px', cursor: 'pointer' }}>
            Inject effect
          </button>
        </div>
      )}

      {/* FORECAST SCRUBBER */}
      {simMode === 'forecast' && (
        <div style={{ borderTop: '1px solid #f59e0b', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#f59e0b', fontSize: 'var(--text-xs)', fontWeight: 700 }}>
            <span>Current time: {formatHour(timeIndex)}</span>
            <span>Forecast: +{forecastHours}h ahead</span>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', marginBottom: 2 }}>Current Time</div>
              <input
                type="range" min="0" max="24" value={timeIndex}
                onChange={(e) => setTimeIndex(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer' }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', marginBottom: 2 }}>Horizon</div>
              <input
                type="range" min="1" max="4" value={forecastHours}
                onChange={(e) => setForecastHours(parseInt(e.target.value))}
                style={{ width: '100%', accentColor: '#f59e0b', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 1 }}>
                <span>1h</span><span>2h</span><span>3h</span><span>4h</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Row: Layers & Export */}
      <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 700 }} title="Choose what metric to visualize on the 3D map">DATA LAYER:</label>
          <select value={currentLayer} onChange={(e) => onLayerChange(e.target.value)}
            style={{ background: 'var(--input-bg)', color: 'var(--text-primary)', padding: '6px', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: 'var(--text-sm)' }}>
            <option value="occupancy">Occupancy (%)</option>
            <option value="co2">CO₂ Levels (ppm)</option>
            <option value="aiAction">AI Recommendations</option>
            <option value="sustainability">Carbon Footprint</option>
          </select>
        </div>
        <button
          onClick={handleExportSnapshot}
          title="Save the current 3D view as a PNG image"
          style={{ background: '#2E86C1', color: 'white', border: 'none', padding: '8px 16px', fontSize: 'var(--text-sm)', borderRadius: '4px', cursor: 'pointer' }}>
          Export Snapshot
        </button>
      </div>
    </div>
  );
}

export default Controls;
