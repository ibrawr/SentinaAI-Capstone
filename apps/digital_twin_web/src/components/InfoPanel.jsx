import React from 'react';
import { isHVACActive } from '../utils/hvacEnergy';

function InfoPanel({ telemetryData, totalHalls, totalDevices }) {
  const stats = calculateStats(telemetryData);
  const zones = 4;
  const hvacActive = Object.values(telemetryData).filter(d => isHVACActive(d.co2 || 400)).length;

  return (
    <div className="info-panel">
      <h1>SentinaAI Digital Twin</h1>
      <div className="subtitle">Convention Centre</div>

      <h2>Building Overview</h2>
      <div className="stat"><span className="stat-label">Total Zones</span><span className="stat-value">{zones}</span></div>
      <div className="stat"><span className="stat-label">Total Halls</span><span className="stat-value">{totalHalls}</span></div>
      <div className="stat"><span className="stat-label">IoT Devices</span><span className="stat-value">{totalDevices}</span></div>

      <h2>Live Telemetry</h2>
      <div className="stat">
        <span className="stat-label"><span className="status-indicator status-active"></span>Active Sensors</span>
        <span className="stat-value">{stats.activeDevices}</span>
      </div>
      <div className="stat"><span className="stat-label">Avg Occupancy</span><span className="stat-value">{stats.avgOccupancy}%</span></div>
      <div className="stat"><span className="stat-label">Avg Temp</span><span className="stat-value">{stats.avgTemp}°C</span></div>
      <div className="stat"><span className="stat-label">Avg CO₂</span><span className="stat-value">{stats.avgCO2} ppm</span></div>
      <div className="stat">
        <span className="stat-label" style={{ color: hvacActive > 0 ? '#3b82f6' : undefined }}>Active HVAC</span>
        <span className="stat-value">{hvacActive}/{totalHalls}</span>
      </div>
    </div>
  );
}

function calculateStats(data) {
  const values = Object.values(data);
  if (values.length === 0) return { activeDevices: 0, avgOccupancy: 0, avgTemp: '—', avgCO2: '—' };
  const sum = values.reduce((acc, val) => {
    const occ = val.occupancyRatio ? (val.occupancyRatio * 100) : (val.occupancy || 0);
    return {
      occ:  acc.occ  + Number(occ),
      temp: acc.temp + Number(val.temperature || 22.5),
      co2:  acc.co2  + Number(val.co2 || 400)
    };
  }, { occ: 0, temp: 0, co2: 0 });

  return {
    activeDevices: values.length,
    avgOccupancy:  Math.round(sum.occ / values.length),
    avgTemp:       (sum.temp / values.length).toFixed(1),
    avgCO2:        Math.round(sum.co2 / values.length)
  };
}

export default InfoPanel;
