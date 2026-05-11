import { useState, useEffect, useMemo } from 'react';

const hallIdMap = {
  'northhall1': 'HZA01', 'northhall2': 'HZA02', 'northhall3': 'HZA03',
  'northhall4': 'HZA04', 'northhall5': 'HZA05', 'northhall6': 'HZA06',
  'easthall1': 'HZB01', 'easthall2': 'HZB02', 'easthall3': 'HZB03', 'easthall4': 'HZB04',
  'hall7': 'HZB05', 'hall8': 'HZB06', 'hall9': 'HZB07', 'hall10': 'HZB08',
  'southhall1': 'HZC01', 'southhall2': 'HZC02', 'southhall3': 'HZC03',
  'southhall4': 'HZC04', 'southhall5': 'HZC05', 'southhall6': 'HZC06',
  'hall1': 'HZD01', 'hall2': 'HZD02', 'hall3': 'HZD03', 'hall4': 'HZD04',
  'hall5': 'HZD05', 'hall6': 'HZD06'
};

const generateSimulationHistory = () => {
  const history = [];
  const reactIds = Object.values(hallIdMap);
  for (let hour = 0; hour <= 24; hour++) {
    const hourData = {};
    reactIds.forEach(id => {
      const timeCurve = 1 - Math.abs(hour - 12) / 12; 
      const baseRatio = (timeCurve * 0.8) + (Math.random() * 0.25); 
      const isAnomaly = baseRatio > 0.92;
      hourData[id] = {
        occupancyRatio: Math.min(baseRatio, 1.1),
        co2: Math.round(400 + (baseRatio * 600)),
        aiAction: isAnomaly ? 'dispatchSecurityAndOpenRoutes' : 'monitor',
        isAnomaly: isAnomaly,
        temperature: (21 + (timeCurve * 4)).toFixed(1),
        hallName: Object.keys(hallIdMap).find(key => hallIdMap[key] === id)
      };
    });
    history.push(hourData);
  }
  return history;
};

export function useTelemetry(simMode = 'live', timeIndex = 24, forecastHours = 1) {
  const [liveData, setLiveData] = useState({});
  const [sandboxData, setSandboxData] = useState({}); 
  const [isRetraining, setIsRetraining] = useState(false);

  const historyData = useMemo(() => generateSimulationHistory(), []);

  // 1. LIVE DATA POLLING
  useEffect(() => {
    if (simMode !== 'live') return;
    const fetchAIData = async () => {
      try {
        const response = await fetch('/api/venue-status');
        const result = await response.json();
        if (result.status === "success") {
          const formattedData = {};
          result.data.forEach(hall => {
            const reactId = hallIdMap[hall.id] || hall.id;
            formattedData[reactId] = {
              occupancyRatio: hall.occupancyRatio,
              co2: Math.round(hall.co2),
              aiAction: hall.aiRecommendedAction,
              isAnomaly: hall.isAnomaly,
              temperature: "22.5",
              hallName: hall.id
            };
          });
          setLiveData(formattedData);
          setSandboxData(formattedData); 
        }
      } catch (err) { console.error("FastAPI Offline"); }
    };
    fetchAIData();
    const interval = setInterval(fetchAIData, 5000);
    return () => clearInterval(interval);
  }, [simMode]);

  // 2. DATA INJECTION ENGINE
  const applyLocalInjection = (targetHall, occupancy, co2) => {
    const occupancyRatio = Math.min(parseInt(occupancy) / 100, 1.1);
    const co2Val = parseInt(co2);
    const isAnomaly = occupancyRatio > 0.92;
    const aiAction = isAnomaly ? 'dispatchSecurityAndOpenRoutes' : 'monitor';
    const reactId = hallIdMap[targetHall] || targetHall;
    setSandboxData(prev => ({
      ...prev,
      [reactId]: {
        ...prev[reactId],
        occupancyRatio,
        co2: co2Val,
        aiAction,
        isAnomaly,
        hallName: targetHall
      }
    }));
  };

  const injectData = async (targetHall, occupancy, co2) => {
    try {
      const response = await fetch('/api/simulate-prediction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hall_id: targetHall, occupancy: parseInt(occupancy), co2: parseInt(co2) })
      });
      if (!response.ok) {
        applyLocalInjection(targetHall, occupancy, co2);
        return;
      }
      const result = await response.json();
      if (result.status === "success") {
        setSandboxData(prev => {
          const newState = { ...prev };
          result.updates.forEach(update => {
            const reactId = hallIdMap[update.hall_id] || update.hall_id;
            newState[reactId] = {
              ...newState[reactId],
              occupancyRatio: update.occupancyRatio,
              co2: update.co2,
              aiAction: update.aiAction,
              isAnomaly: update.isAnomaly,
              hallName: update.hall_id
            };
          });
          return newState;
        });
      } else {
        applyLocalInjection(targetHall, occupancy, co2);
      }
    } catch (err) {
      applyLocalInjection(targetHall, occupancy, co2);
    }
  };

  // 3. MODE-BASED DATA SELECTION
  let currentData = liveData;
  if (simMode === 'history') currentData = historyData[timeIndex];
  if (simMode === 'sandbox') currentData = sandboxData;
  if (simMode === 'forecast') {
    const baseSnap = historyData[timeIndex] || {};
    const targetIdx = Math.min(timeIndex + forecastHours, 24);
    const futureSnap = historyData[targetIdx] || {};
    const forecast = {};
    for (const hallId in baseSnap) {
      const c = baseSnap[hallId];
      const f = futureSnap[hallId] || c;
      const occ = Math.min(f.occupancyRatio * 0.6 + c.occupancyRatio * 0.4, 1.1);
      const co2 = Math.round(f.co2 * 0.6 + c.co2 * 0.4);
      const temp = (parseFloat(f.temperature) * 0.6 + parseFloat(c.temperature) * 0.4).toFixed(1);
      forecast[hallId] = {
        occupancyRatio: occ,
        co2,
        temperature: temp,
        isAnomaly: occ > 0.92,
        aiAction: occ > 0.92 ? 'dispatchSecurityAndOpenRoutes' : 'monitor',
        hallName: c.hallName,
        isForecast: true,
      };
    }
    currentData = forecast;
  }

  // 4. AUTOMATIC RETRAINING TRIGGER (No Button Required)

  const activeAnomalies = Object.values(currentData || {}).filter(hall => hall.isAnomaly);

  useEffect(() => {
    if (activeAnomalies.length > 0 && !isRetraining) {
      setIsRetraining(true);
      console.log("Anomaly Detected: Step 7/8 Continuous Learning Auto-Triggered...");
      
      fetch('/api/retrain', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
          if (data.status === "success") {
            console.log("Model Updated Automatically.");
            setTimeout(() => setIsRetraining(false), 5000); // Cooldown to avoid spam
          }
        })
        .catch(err => setIsRetraining(false));
    }
  }, [activeAnomalies.length]);

  return { telemetryData: currentData, injectData, activeAnomalies, isRetraining };
}