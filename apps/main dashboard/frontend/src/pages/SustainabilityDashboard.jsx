/**
 * Displays the sustainability dashboard page with live sustainability KPI cards,
 * electricity and carbon trend panels, top-hall energy ranking, environment
 * health scoring, and AI sustainability status. This page fetches KPI data from
 * the sustainability AI API, uses dashboard refresh settings utilities, and
 * composes TrendPanel, TopHallsEnergyBar, ComfortGauge, AiSustPanel, and
 * InfoTooltip for the main dashboard views.
 */

import "./SustainabilityDashboard.css";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";

import TrendPanel from "../components/TrendPanel";
import ComfortGauge from "../components/ComfortGauge";
import TopHallsEnergyBar from "../components/TopHallsEnergyBar";
import AiSustPanel from "../components/AiSustPanel";
import InfoTooltip from "../components/InfoTooltip";
import {
  getDashboardRefreshMs,
  useDashboardSettings,
} from "../utils/dashboardSettings";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const IconCircle = ({ children }) => <div className="iconCircle">{children}</div>;


const CurrentEnergyIcon = () => (
  <svg fill="#FFFFFF" viewBox="0 0 32 32" version="1.1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M18.605 2.022v0zM18.605 2.022l-2.256 11.856 8.174 0.027-11.127 16.072 2.257-13.043-8.174-0.029zM18.606 0.023c-0.054 0-0.108 0.002-0.161 0.006-0.353 0.028-0.587 0.147-0.864 0.333-0.154 0.102-0.295 0.228-0.419 0.373-0.037 0.043-0.071 0.088-0.103 0.134l-11.207 14.832c-0.442 0.607-0.508 1.407-0.168 2.076s1.026 1.093 1.779 1.099l5.773 0.042-1.815 10.694c-0.172 0.919 0.318 1.835 1.18 2.204 0.257 0.11 0.527 0.163 0.793 0.163 0.629 0 1.145-0.294 1.533-0.825l11.22-16.072c0.442-0.607 0.507-1.408 0.168-2.076-0.34-0.669-1.026-1.093-1.779-1.098l-5.773-0.010 1.796-9.402c0.038-0.151 0.057-0.308 0.057-0.47 0-1.082-0.861-1.964-1.939-1.999-0.024-0.001-0.047-0.001-0.071-0.001v0z"></path>
  </svg>
);

const CarbonEmissionIcon = () => (
  <svg fill="#FFFFFF" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <g>
      <path d="M198.91,155.31h8.26a30.81,30.81,0,0,0,30.77-30.77v-.34h-18v.34a12.79,12.79,0,0,1-12.77,12.77h-8.26a12.79,12.79,0,0,1-12.77-12.77V92.76A12.79,12.79,0,0,1,198.91,80h8.26a12.79,12.79,0,0,1,12.77,12.77h18A30.81,30.81,0,0,0,207.17,62h-8.26a30.8,30.8,0,0,0-30.77,30.77v31.78A30.8,30.8,0,0,0,198.91,155.31Z"></path>
      <path d="M283.47,155.31a34.94,34.94,0,0,0,34.9-34.9V96.89a34.9,34.9,0,1,0-69.8,0v23.52A34.93,34.93,0,0,0,283.47,155.31Zm-16.9-58.42a16.9,16.9,0,1,1,33.8,0v23.52a16.9,16.9,0,1,1-33.8,0Z"></path>
      <path d="M362.8,155.25l-17.13,5.44a20.44,20.44,0,0,0,6.18,39.92h27.4v-18h-27.4a2.44,2.44,0,0,1-.73-4.76l17.13-5.44a21.64,21.64,0,0,0,15.14-20.69v-2.13a21.74,21.74,0,0,0-21.72-21.71h-8.54a21.74,21.74,0,0,0-21.71,21.71v2.63h18v-2.63a3.72,3.72,0,0,1,3.71-3.71h8.54a3.72,3.72,0,0,1,3.72,3.71v2.13A3.69,3.69,0,0,1,362.8,155.25Z"></path>
      <path d="M227.17,197.14a69.65,69.65,0,0,1,66.56,49.92,25.71,25.71,0,0,0,25,18.6h.14a53.1,53.1,0,0,1,53.08,54A51.68,51.68,0,0,1,366.88,341,59.37,59.37,0,0,1,383.49,348a69.36,69.36,0,0,0,6.44-28,71.1,71.1,0,0,0-71.08-72.3h-.18A7.86,7.86,0,0,1,311,242a87.33,87.33,0,0,0-167.69,0,7.87,7.87,0,0,1-7.68,5.62h-.16A71.1,71.1,0,0,0,64.41,320c.64,38.52,33,69.87,72.09,69.87h28.64a59.43,59.43,0,0,1,5.92-18H136.5c-29.35,0-53.62-23.41-54.1-52.17a53.1,53.1,0,0,1,53.08-54h.18a26.81,26.81,0,0,0,5.26-.53,37.07,37.07,0,0,1,10.05,25l20.33-.58a56.61,56.61,0,0,0-13.56-36,26,26,0,0,0,2.86-6.42A69.66,69.66,0,0,1,227.17,197.14Z"></path>
      <path d="M354.22,356.33a32.91,32.91,0,0,0-13.34,26.05l-18-.51a50.25,50.25,0,0,1,17-37,54.55,54.55,0,0,0-103.78,3,11.76,11.76,0,0,1-11.38,8.44h-.1a43.23,43.23,0,0,0-43.23,44c.39,23.71,20.23,42.5,43.94,42.5H351.58c23.71,0,43.55-18.79,43.95-42.5A43.23,43.23,0,0,0,354.22,356.33Z"></path>
    </g>
  </svg>
);

const HVACIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M7 12H17M8 8.5C8 8.5 9 9 10 9C11.5 9 12.5 8 14 8C15 8 16 8.5 16 8.5M8 15.5C8 15.5 9 16 10 16C11.5 16 12.5 15 14 15C15 15 16 15.5 16 15.5M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
      stroke="#FFFFFF"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const AutomationIcon = () => (
  <svg fill="#FFFFFF" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      d="M144.282 145.51A32.19 32.19 0 0 1 150 145c4.032 0 7.89.746 11.444 2.107L175.584 127l.54.306A31.88 31.88 0 0 1 168 106c0-17.673 14.327-32 32-32 17.673 0 32 14.327 32 32 0 17.673-14.327 32-32 32-3.672 0-7.2-.619-10.485-1.757l-14.31 21.038A31.863 31.863 0 0 1 182 177c0 17.673-14.327 32-32 32-17.673 0-32-14.327-32-32 0-9.767 4.376-18.512 11.274-24.382l-20.764-41.28A32.14 32.14 0 0 1 102 112a32.05 32.05 0 0 1-8.16-1.05l-14.716 25.93C85.21 142.705 89 150.91 89 160c0 17.673-14.327 32-32 32-17.673 0-32-14.327-32-32 0-17.673 14.327-32 32-32 2.655 0 5.234.323 7.7.932l14.809-26.17C73.638 96.963 70 88.907 70 80c0-17.673 14.327-32 32-32 17.673 0 32 14.327 32 32 0 9.563-4.195 18.146-10.844 24.01l21.126 41.5zM200 122c8.837 0 16-7.163 16-16s-7.163-16-16-16-16 7.163-16 16 7.163 16 16 16zM57 176c8.837 0 16-7.163 16-16s-7.163-16-16-16-16 7.163-16 16 7.163 16 16 16zm45-80c8.837 0 16-7.163 16-16s-7.163-16-16-16-16 7.163-16 16 7.163 16 16 16zm48 97c8.837 0 16-7.163 16-16s-7.163-16-16-16-16 7.163-16 16 7.163 16 16 16z"
      fillRule="evenodd"
    ></path>
  </svg>
);

const ElectricityIcon = () => (
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M18.4164 31H29.5837C30.0096 30.0175 30.5783 29.0337 31.1077 28.1972C31.9501 26.8663 32.8498 25.6684 33.3793 25.0221C34.7882 23.2987 35.668 21.225 35.9229 19.0407C36.1778 16.8563 35.798 14.6443 34.8245 12.6584C33.8509 10.6721 32.3213 8.98968 30.4066 7.80939C28.4915 6.62888 26.2713 6.00036 24.0019 6C21.7326 5.99964 19.5121 6.62747 17.5967 7.80738C15.6816 8.98707 14.1514 10.6691 13.1771 12.6551C12.203 14.6407 11.8225 16.8525 12.0767 19.037C12.3308 21.2216 13.2102 23.2957 14.6187 25.0197C15.1472 25.6656 16.0473 26.8635 16.8906 28.1951C17.4206 29.032 17.9901 30.0165 18.4164 31ZM34.9273 26.2885C36.5762 24.2717 37.6099 21.8396 37.9094 19.2725C38.209 16.7053 37.7621 14.1074 36.6204 11.7782C35.4787 9.44891 33.6885 7.48298 31.4561 6.10687C29.2237 4.73075 26.6398 4.00041 24.0022 4C21.3646 3.99959 18.7806 4.72911 16.5477 6.10453C14.3149 7.47995 12.524 9.44531 11.3816 11.7742C10.2391 14.1031 9.79137 16.7008 10.0901 19.2681C10.3888 21.8354 11.4217 24.2678 13.0699 26.2851C14.0324 27.4611 16.4803 30.8176 17 33H31C31.5197 30.8193 33.9648 27.4628 34.9273 26.2885Z"
      fill="#FFFFFF"
    ></path>
    <path d="M19 21L25 12V18H29L23 27L23 21H19Z" fill="#FFFFFF"></path>
    <path d="M17 35H31V37H17V35Z" fill="#FFFFFF"></path>
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M29 41H19L19 42H29V41ZM17 39V42C17 43.1046 17.8954 44 19 44H29C30.1046 44 31 43.1046 31 42V39H17Z"
      fill="#FFFFFF"
    ></path>
  </svg>
);

function KpiCard({ title, tooltip, value, sub, icon }) {
  return (
    <div className="card">
      <div className="cardInner">
        <IconCircle>{icon}</IconCircle>

        <p className="cardTitle">
          {title}
          <InfoTooltip text={tooltip} color="#64748b" />
        </p>

        <div className="cardValue">{value}</div>

        {sub ? (
          <div className="metricMetaRow">
            <p className="cardSub" style={{ margin: 0 }}>
              {sub}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CardShell({ title, tooltip, right, icon, children }) {
  return (
    <div className="card">
      <div className="cardHeaderRow">
        <div className="cardHeaderLeft">
          {icon ? <div className="iconCircle iconCircleFloat">{icon}</div> : null}
          <h3>
            {title}
            <InfoTooltip text={tooltip} color="#64748b" />
          </h3>
        </div>

        {right ? <span className="hint">{right}</span> : null}
      </div>

      <div className="cardBody">{children}</div>
    </div>
  );
}

export default function SustainabilityDashboard() {
  const settings = useDashboardSettings("sustainability");
  const refreshMs = getDashboardRefreshMs(settings);
  const [energyUsage, setEnergyUsage] = useState(null);
  const [carbonEmission, setCarbonEmission] = useState(null);
  const [hvacEfficiency, setHvacEfficiency] = useState(null);
  const [automationStatus, setAutomationStatus] = useState("—");

  const [showAiModal, setShowAiModal] = useState(false);

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const r = await axios.get(`${API_BASE}/ai/sust-kpis`);
        if (!alive) return;

        const k = r.data?.kpis || {};

        setEnergyUsage(k.totalEnergyKWh ?? 1450);
        setCarbonEmission(k.totalCarbonKg ?? 520);
        setHvacEfficiency(k.avgEfficiencyScore ?? 82);
        setAutomationStatus(k.automationStatus ?? "Optimal");
      } catch {
        if (!alive) return;
        setEnergyUsage(1450);
        setCarbonEmission(520);
        setHvacEfficiency(82);
        setAutomationStatus("—");
      }
    };

    load();
    const t = setInterval(load, refreshMs);

    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [refreshMs]);

  const energyValue = useMemo(() => {
    const n = Number(energyUsage);
    return Number.isFinite(n) ? `${Math.round(n)} kWh` : "—";
  }, [energyUsage]);

  const carbonValue = useMemo(() => {
    const n = Number(carbonEmission);
    return Number.isFinite(n) ? `${Math.round(n)} kg` : "—";
  }, [carbonEmission]);

  const hvacValue = useMemo(() => {
    const n = Number(hvacEfficiency);
    return Number.isFinite(n) ? `${Math.round(n)}%` : "—";
  }, [hvacEfficiency]);

  const tooltipText = {
    currentEnergyUsage: "Total energy consumption shown for the latest interval.",
    carbonEmissionEstimate: "Estimated carbon output calculated from the latest energy usage data.",
    hvacEfficiency: "HVAC efficiency score based on current sustainability analytics.",
    automationStatus: "Current AI recommendation or automation state for sustainability controls.",
    electricityConsumption: "Six-hour electricity consumption trend for the monitored venue data.",
    carbonForecastSnapshot: "Six-hour carbon trend snapshot based on current sustainability readings.",
    topHallsByEnergyUse: "Ranks halls by energy use so the most energy-intensive areas are visible quickly.",
    environmentHealthScore: "Gauge view of the overall environment health and comfort score.",
  };

  return (
    <div className="sustTheme">
      <div className="dashboardWrap">
        <div className="topRow">
          <KpiCard
            title="Current Energy Usage"
            tooltip={tooltipText.currentEnergyUsage}
            value={energyValue}
            sub="Latest interval"
            icon={<CurrentEnergyIcon />}
          />

          <KpiCard
            title="Carbon Emission Estimate"
            tooltip={tooltipText.carbonEmissionEstimate}
            value={carbonValue}
            sub="Latest interval"
            icon={<CarbonEmissionIcon />}
          />

          <KpiCard
            title="HVAC Efficiency"
            tooltip={tooltipText.hvacEfficiency}
            value={hvacValue}
            sub="AI/analytics score"
            icon={<HVACIcon />}
          />

          <div onClick={() => setShowAiModal(true)} style={{ cursor: "pointer" }}>
            <KpiCard
              title="Automation Status"
              tooltip={tooltipText.automationStatus}
              value={automationStatus}
              sub="AI recommendation"
              icon={<AutomationIcon />}
            />
          </div>
        </div>

        <div className="grid2">
          <CardShell title="Electricity Consumption" tooltip={tooltipText.electricityConsumption} right="6h" icon={<ElectricityIcon />}>
            <TrendPanel metric="energy" unit="kWh" hours={6} embedded accent="#00802B" />
          </CardShell>

          <CardShell title="Carbon Forecast Snapshot" tooltip={tooltipText.carbonForecastSnapshot} right="6h" icon={<CarbonEmissionIcon />}>
            <TrendPanel metric="carbon" unit="kgCO2" hours={6} embedded accent="#00802B" />
          </CardShell>
        </div>

        <div className="grid2">
          <CardShell title="Top Halls by Energy Use" tooltip={tooltipText.topHallsByEnergyUse} icon={<ElectricityIcon />}>
            <TopHallsEnergyBar title={null} limit={5} embedded />
          </CardShell>

          <CardShell title="Environment Health Score" tooltip={tooltipText.environmentHealthScore} icon={<CarbonEmissionIcon />}>
            <ComfortGauge title={null} value={hvacEfficiency} embedded accent="var(--sust-accent)" />
          </CardShell>
        </div>

        <div className="floatRow">
          <AiSustPanel />
        </div>
      </div>

      {showAiModal && (
        <div className="aiModalOverlay" onClick={() => setShowAiModal(false)}>
          <div className="aiModalCard" onClick={(e) => e.stopPropagation()}>
            <div className="aiModalHeader">
              <h2>AI Sustainability - Live Status</h2>
              <button onClick={() => setShowAiModal(false)}>Close</button>
            </div>

            <div className="aiModalBody">
              <AiSustPanel />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}