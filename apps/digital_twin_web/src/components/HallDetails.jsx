import React from 'react';
import EventsWidget from './EventsWidget';
import { calculateHVACEnergy, getHVACStatus } from '../utils/hvacEnergy';

function formatCamelCase(str) {
  return str.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, s => s.toUpperCase());
}

export default function HallDetails({ hall, telemetryData, onClose, simMode }) {
  if (!hall) return null;
  const data = telemetryData[hall.id] || telemetryData[hall.telemetryId] || {};
  const occupancyPercent = data.occupancyRatio ? Math.round(data.occupancyRatio * 100) : (data.occupancy || 0);
  const co2 = data.co2 || 400;
  const isForecast = simMode === 'forecast';

  const PredBadge = () => isForecast
    ? <span style={{ color: '#f59e0b', fontSize: 'var(--text-xs)', fontWeight: 700, marginRight: 4 }}>PREDICTED : </span>
    : null;

  return (
    <div className="hall-details">
      <button className="close-btn" onClick={onClose}>×</button>
      <h2 style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '15px' }}>{hall.id}</h2>

      <div className="stat"><span className="stat-label">Occupancy</span><span className="stat-value"><PredBadge />{occupancyPercent}%</span></div>
      <div className="stat"><span className="stat-label">CO₂ Level</span><span className="stat-value"><PredBadge />{co2} ppm</span></div>
      <div className="stat"><span className="stat-label">Ambient Temp</span><span className="stat-value"><PredBadge />{data.temperature || 22.5}°C</span></div>

      {/* HVAC status (Feature 2) */}
      {co2 > 800 && (
        <>
          <div className="stat">
            <span className="stat-label">HVAC Status </span>
            <span className="stat-value" style={{ color: '#3b82f6' }}>{getHVACStatus(co2).toUpperCase()}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Energy Cost </span>
            <span className="stat-value">{calculateHVACEnergy(co2)} kWh</span>
          </div>
        </>
      )}

      {/* Anomaly status */}
      <div style={{
        marginTop: '20px', padding: '12px', borderRadius: '6px',
        border: `1px solid ${data.isAnomaly ? '#ef4444' : '#4ade80'}`,
        background: data.isAnomaly ? 'rgba(239, 68, 68, 0.1)' : 'rgba(74, 222, 128, 0.05)'
      }}>
        <h4 style={{ margin: 0, color: data.isAnomaly ? '#ef4444' : '#4ade80', fontSize: 'var(--text-sm)', textTransform: 'uppercase' }}>
          {data.isAnomaly ? '⚠️ Anomaly Detected' : '✅ System Normal'}
        </h4>
        <p style={{ margin: '8px 0 0 0', fontWeight: 600, color: 'var(--text-primary)', fontSize: 'var(--text-base)' }}>
          {data.aiAction ? formatCamelCase(data.aiAction) : 'Monitoring'}
        </p>
      </div>


      {/* Event schedule (Feature 3) */}
      <EventsWidget hallId={hall.id} />
    </div>
  );
}
