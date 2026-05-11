/**
 * Renders the operations dashboard page with live KPI cards, alert trends,
 * device status, comfort scoring, busiest hall monitoring, AI surge simulation,
 * occupancy forecasting, and AI operations status. This page uses dashboard
 * refresh settings utilities, fetches overview and congestion data from the
 * dashboard API, and composes AiOpsPanel, AiSimulateSurge, PredictedOccupancyChart,
 * InfoTooltip, TrendPanel, TopHallsEnergyBar, ComfortGauge, TopHallsBar,
 * DevicesStatusBars, and AlertsTrendPanel.
 */

import "./DashboardPage.css";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";

import AiOpsPanel from "../components/AiOpsPanel";
import AiSimulateSurge from "../components/AiSimulateSurge";
import PredictedOccupancyChart from "../components/PredictedOccupancyChart";
import InfoTooltip from "../components/InfoTooltip";

import TrendPanel from "../components/TrendPanel";
import TopHallsEnergyBar from "../components/TopHallsEnergyBar";
import ComfortGauge from "../components/ComfortGauge";
import TopHallsBar from "../components/TopHallsBar";

import DevicesStatusBars from "../components/DeviceStatusBars";
import AlertsTrendPanel from "../components/AlertsTrendPanel";
import {
  getDashboardRefreshMs,
  useDashboardSettings,
} from "../utils/dashboardSettings";

import busyHallsIcon from "../assets/icons/busy_halls.svg";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

const PinkIcon = ({ children }) => <div className="iconCircle">{children}</div>;

const IcoPeople = () => (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M16 11c1.66 0 3-1.57 3-3.5S17.66 4 16 4s-3 1.57-3 3.5S14.34 11 16 11Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path
      d="M8 11c1.66 0 3-1.57 3-3.5S9.66 4 8 4 5 5.57 5 7.5 6.34 11 8 11Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
    <path d="M20 20c0-3-2.7-5-6-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path
      d="M4 20c0-3 2.7-5 6-5 3.3 0 6 2 6 5"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    />
  </svg>
);

const IcoThermo = () => (
  <svg viewBox="0 0 24 24" fill="none">
    <path
      d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const IcoHvacEnergy = () => (
  <svg viewBox="0 0 31 31" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clipPath="url(#clip0_hvac)">
      <path d="M29.5909 11.2727H27.4596C27.3104 10.8512 27.1387 10.4373 26.9451 10.0331L28.4528 8.52538C29.0031 7.97508 29.0031 7.08294 28.4529 6.53264L24.4675 2.54707C24.2032 2.28282 23.8447 2.1343 23.471 2.1343C23.0973 2.1343 22.739 2.28273 22.4747 2.54707L20.9669 4.0548C20.5626 3.86119 20.1489 3.68956 19.7273 3.54039V1.40909C19.7273 0.630897 19.0964 0 18.3182 0H12.6818C11.9036 0 11.2727 0.630897 11.2727 1.40909V3.54039C10.8511 3.68956 10.4373 3.86128 10.0332 4.0548L8.52538 2.54707C7.97517 1.99678 7.08294 1.99678 6.53264 2.54707L2.54707 6.53264C1.99678 7.08294 1.99678 7.97508 2.54707 8.52538L4.0548 10.0332C3.86128 10.4374 3.68966 10.8511 3.54048 11.2727H1.40909C0.630897 11.2727 0 11.9036 0 12.6818V18.3182C0 19.0964 0.630897 19.7273 1.40909 19.7273H3.54048C3.68966 20.1488 3.86138 20.5627 4.0548 20.9668L2.54707 22.4746C2.28282 22.7389 2.1343 23.0973 2.1343 23.4709C2.1343 23.8447 2.28273 24.2031 2.54707 24.4674L6.53273 28.4528C7.08303 29.003 7.97517 29.003 8.52538 28.4528L10.0333 26.9452C10.4376 27.1387 10.8512 27.3104 11.2727 27.4596V29.5909C11.2727 30.3691 11.9036 31 12.6818 31H18.3182C19.0964 31 19.7273 30.3691 19.7273 29.5909V27.4595C20.1489 27.3103 20.5627 27.1387 20.9669 26.9451L22.4748 28.4528C23.025 29.003 23.9172 29.0031 24.4675 28.4527L28.4529 24.4673C29.0032 23.917 29.0032 23.0248 28.4529 22.4745L26.9452 20.9668C27.1388 20.5626 27.3105 20.1488 27.4597 19.7272H29.5909C30.3691 19.7272 31 19.0963 31 18.3181V12.6817C31 11.9036 30.3691 11.2727 29.5909 11.2727ZM28.1818 16.9091H26.4175C25.7744 16.9091 25.2131 17.3444 25.0529 17.9672C24.8241 18.8567 24.4692 19.712 23.9982 20.509C23.6711 21.0626 23.7603 21.7675 24.215 22.2222L25.4639 23.471L23.4711 25.4638L22.2222 24.215C21.7676 23.7605 21.0628 23.6712 20.5093 23.9982C19.7122 24.4691 18.8568 24.824 17.967 25.0531C17.3443 25.2132 16.9091 25.7746 16.9091 26.4176V28.1818H14.0909V26.4176C14.0909 25.7747 13.6557 25.2133 13.0331 25.0531C12.1434 24.824 11.2881 24.4691 10.4909 23.9982C9.93719 23.6711 9.23255 23.7604 8.77798 24.215L7.52905 25.4638L5.53613 23.4709L6.78496 22.2221C7.23972 21.7674 7.32887 21.0626 7.00177 20.509C6.53095 19.7121 6.17614 18.8568 5.94702 17.9669C5.78685 17.3443 5.22538 16.9091 4.58246 16.9091H2.81818V14.0909H4.58246C5.22538 14.0909 5.78676 13.6557 5.94702 13.0331C6.17605 12.1431 6.53095 11.2878 7.00177 10.4909C7.32887 9.93729 7.23972 9.23246 6.78496 8.77779L5.53622 7.52896L7.52905 5.53622L8.77788 6.78496C9.23255 7.23963 9.93747 7.32887 10.491 7.00177C11.2879 6.53085 12.1434 6.17605 13.0332 5.94693C13.6557 5.78676 14.0909 5.22538 14.0909 4.58236V2.81818H16.9091V4.58236C16.9091 5.22528 17.3443 5.78667 17.9669 5.94693C18.8569 6.17605 19.7122 6.53085 20.5092 7.00177C21.0629 7.32878 21.7676 7.23963 22.2223 6.78496L23.4711 5.53622L25.4639 7.52896L24.215 8.77779C23.7603 9.23246 23.6711 9.93738 23.9982 10.491C24.4692 11.2879 24.824 12.1432 25.0529 13.0328C25.2131 13.6555 25.7745 14.0908 26.4175 14.0908H28.1818V16.9091Z" fill="white" />
      <path d="M17.5096 12.4362L14.2786 15.6671L13.3962 14.7847C12.846 14.2344 11.9537 14.2344 11.4034 14.7847C10.8531 15.335 10.8531 16.2272 11.4034 16.7775L13.2822 18.6563C13.5574 18.9314 13.918 19.0689 14.2786 19.0689C14.6393 19.0689 14.9999 18.9314 15.275 18.6562L19.5022 14.4289C20.0525 13.8786 20.0525 12.9864 19.5022 12.4361C18.952 11.8859 18.0598 11.8859 17.5096 12.4362Z" fill="white" />
    </g>
    <defs><clipPath id="clip0_hvac"><rect width="31" height="31" fill="white" /></clipPath></defs>
  </svg>
);

const IcoCarbon = () => (
  <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18.6479 14.5603H19.4222C20.187 14.5593 20.9202 14.2551 21.4609 13.7143C22.0017 13.1735 22.3059 12.4404 22.3069 11.6756V11.6437H20.6194V11.6756C20.6189 11.993 20.4926 12.2972 20.2682 12.5216C20.0438 12.746 19.7396 12.8723 19.4222 12.8728H18.6479C18.3305 12.8723 18.0263 12.746 17.8019 12.5216C17.5775 12.2972 17.4512 11.993 17.4507 11.6756V8.69625C17.4514 8.37905 17.5778 8.07507 17.8022 7.85086C18.0266 7.62666 18.3307 7.5005 18.6479 7.5H19.4222C19.7396 7.5005 20.0438 7.62679 20.2682 7.8512C20.4926 8.0756 20.6189 8.37983 20.6194 8.69719H22.3069C22.3059 7.93243 22.0017 7.19927 21.4609 6.6585C20.9202 6.11773 20.187 5.81349 19.4222 5.8125H18.6479C17.883 5.81324 17.1497 6.11741 16.6089 6.65823C16.0681 7.19905 15.7639 7.93235 15.7632 8.69719V11.6766C15.7642 12.4412 16.0684 13.1743 16.6092 13.7149C17.15 14.2555 17.8832 14.5596 18.6479 14.5603Z" fill="white" stroke="white" strokeWidth="0.00512"/></svg>
);

const IcoDevices = () => (
  <svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M27.0347 17.3792H23.1726V13.5171H21.2415V22.2068H5.79314V6.75845L14.4829 6.75758V4.82741H10.6208V0.965332H8.68971V4.82741H5.79314C5.28115 4.82792 4.79028 5.03153 4.42825 5.39356C4.06622 5.75559 3.8626 6.24646 3.86209 6.75845V9.655H0V11.586H3.86209V17.3792H0V19.3102H3.86209V22.2068C3.86268 22.7187 4.06632 23.2095 4.42833 23.5716C4.79035 23.9336 5.28118 24.1372 5.79314 24.1378H8.68971V27.9999H10.6208V24.1378H16.4139V27.9999H18.3449V24.1378H21.2415C21.7534 24.1371 22.2442 23.9334 22.6062 23.5714C22.9682 23.2094 23.1719 22.7187 23.1726 22.2068V19.3102H27.0347V17.3792Z" fill="currentColor"/>
    <path d="M18.3447 19.3105H8.68945V9.65527H18.3447V19.3105ZM10.6205 17.3794H16.4136V11.5863H10.6205V17.3794Z" fill="currentColor"/>
    <path d="M28.0003 11.5862H26.0693C26.0663 9.02643 25.0481 6.57233 23.238 4.76228C21.428 2.95223 18.9739 1.93403 16.4141 1.93104V0C19.4859 0.00334794 22.431 1.22511 24.6031 3.39723C26.7752 5.56934 27.997 8.5144 28.0003 11.5862Z" fill="currentColor"/>
    <path d="M23.1727 11.5863H21.2417C21.2402 10.3064 20.7311 9.07933 19.826 8.17431C18.921 7.26929 17.694 6.76018 16.4141 6.75867V4.82764C18.2059 4.82981 19.9237 5.54257 21.1908 6.80959C22.4578 8.07661 23.1706 9.79444 23.1727 11.5863Z" fill="currentColor"/>
  </svg>
);

const IcoFlow = () => (
  <svg viewBox="0 0 30 39" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M18.3103 29.2589C20.5518 29.9793 22.531 30.4382 25.3746 31.2584C24.2822 44.2142 11.2291 39.069 18.3103 29.2589ZM29.9647 17.3573C29.8175 13.4672 29.0874 8.36422 23.2724 9.1638C20.5465 9.83151 18.5324 12.6413 17.5851 17.4891C17.0649 20.1546 17.3674 23.8959 17.9811 26.1387C18.5414 27.7192 18.3509 27.622 18.9531 27.9222C21.2841 28.415 23.5917 28.9606 25.9417 29.5169C28.3289 27.9346 30.2896 19.5343 29.9647 17.3573ZM12.0191 17.0587C12.6324 14.8157 12.9349 11.0743 12.4149 8.40916C11.4683 3.56112 9.45397 0.750849 6.72757 0.0835961C0.91257 -0.715987 0.182543 4.38688 0.0353438 8.27721C-0.289606 10.4538 1.6713 18.8547 4.0588 20.4367C6.40858 19.8804 8.71588 19.3353 11.0476 18.842C11.6491 18.5421 11.4586 18.6392 12.0191 17.0587ZM4.62511 22.1786C5.71717 35.1343 18.7702 29.9891 11.6892 20.1791C9.44776 20.8996 7.46872 21.3584 4.62511 22.1786Z" fill="white"/></svg>
);

const IcoAlert = () => (
  <svg viewBox="0 0 24 24" fill="none"><path d="M11.9998 8.99999V13M11.9998 17H12.0098M10.6151 3.89171L2.39019 18.0983C1.93398 18.8863 1.70588 19.2803 1.73959 19.6037C1.769 19.8857 1.91677 20.142 2.14613 20.3088C2.40908 20.5 2.86435 20.5 3.77487 20.5H20.2246C21.1352 20.5 21.5904 20.5 21.8534 20.3088C22.0827 20.142 22.2305 19.8857 22.2599 19.6037C22.2936 19.2803 22.0655 18.8863 21.6093 18.0983L13.3844 3.89171C12.9299 3.10654 12.7026 2.71396 12.4061 2.58211C12.1474 2.4671 11.8521 2.4671 11.5935 2.58211C11.2969 2.71396 11.0696 3.10655 10.6151 3.89171Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
);

const IcoComfort = () => (
  <svg viewBox="0 0 37 37" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.71473 33.4641L10.2889 28.8899C12.212 30.1489 14.4654 30.8088 16.7639 30.7862C18.593 30.7639 20.3991 30.3755 22.0757 29.6439C23.7523 28.9123 25.2654 27.8524 26.5257 26.5266C32.4041 20.6574 33.8517 5.41035 33.9164 4.76285C33.9374 4.53717 33.9083 4.30963 33.8313 4.09645C33.7543 3.88328 33.6313 3.6897 33.4709 3.52952C33.3099 3.37028 33.1162 3.24796 32.9033 3.17103C32.6903 3.09409 32.4631 3.06439 32.2376 3.08398C29.2801 3.39234 26.3451 3.88717 23.4501 4.56552C23.1986 4.62461 22.9661 4.74592 22.7737 4.91832C22.5814 5.09072 22.4354 5.30868 22.3493 5.55219L21.3488 8.3796L20.5178 6.7069C20.3512 6.3725 20.0687 6.11001 19.7231 5.96823C19.3774 5.82644 18.992 5.81501 18.6385 5.93606C15.6151 6.82294 12.8267 8.37115 10.4754 10.4686C4.97011 15.9739 5.5174 22.9036 8.10894 26.71L3.53481 31.2841C3.25399 31.5749 3.0986 31.9643 3.10211 32.3686C3.10562 32.7728 3.26776 33.1594 3.55359 33.4453C3.83943 33.7311 4.2261 33.8933 4.63032 33.8968C5.03454 33.9003 5.42397 33.7449 5.71473 33.4641ZM12.6522 12.6516C14.3114 11.1653 16.2544 10.0304 18.3641 9.3154L20.2018 13.0154C20.3324 13.2906 20.5433 13.5198 20.8066 13.6731C21.0699 13.8263 21.3733 13.8964 21.6771 13.8741C21.9792 13.8554 22.269 13.7482 22.5105 13.5659C22.752 13.3836 22.9346 13.1342 23.0354 12.8489L24.9748 7.38523C27.2025 6.89498 29.2267 6.57585 30.6173 6.38777C30.0515 10.541 28.3356 20.3645 24.3535 24.3466C20.0553 28.6448 15.1883 28.1345 12.532 26.6591L19.5959 19.5952C19.8767 19.3045 20.0321 18.915 20.0286 18.5108C20.0251 18.1066 19.863 17.7199 19.5771 17.4341C19.2913 17.1483 18.9046 16.9861 18.5004 16.9826C18.0962 16.9791 17.7067 17.1345 17.416 17.4153L10.3459 24.4731C8.8659 21.8152 8.35561 16.9574 12.6522 12.6516Z" fill="white" stroke="white" strokeWidth="0.00024"/></svg>
);

const IcoBusyHalls = () => (
  <img src={busyHallsIcon} alt="" aria-hidden="true" className="iconAsset" />
);

function KpiCard({ title, tooltip, value, sub, icon }) {
  return (
    <div className="card">
      <div className="cardInner">
        <PinkIcon>{icon}</PinkIcon>

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

function CardShell({ title, tooltip, right, icon, children, noBodyPad = false }) {
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

      <div className={noBodyPad ? "cardBody cardBodyNoPad" : "cardBody"}>{children}</div>
    </div>
  );
}

function AlertsRangeSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rangeSelect">
      <option value="lifetime">Lifetime</option>
      <option value="30d">30d</option>
      <option value="14d">14d</option>
      <option value="7d">7d</option>
      <option value="1d">1d</option>
    </select>
  );
}

export default function DashboardPage() {
  const settings = useDashboardSettings("operations");
  const refreshMs = getDashboardRefreshMs(settings);

  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [simTick, setSimTick] = useState(0);

  const [alertsRange, setAlertsRange] = useState("lifetime");
  const [congestionLatest, setCongestionLatest] = useState(null);

  useEffect(() => {
    let alive = true;

    const fetchAll = async () => {
      try {
        const ov = await axios.get(`${API_BASE}/dashboard/overview`);
        if (!alive) return;
        setOverview(ov.data);
        setError("");
      } catch (e) {
        if (!alive) return;
        setError(e?.response?.data?.error || e.message || "Failed to load dashboard");
      }
    };

    fetchAll();
    const t = setInterval(fetchAll, refreshMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [simTick, refreshMs]);

  useEffect(() => {
    let alive = true;

    const loadCongestion = async () => {
      try {
        const r = await axios.get(`${API_BASE}/dashboard/trends`, {
          params: { metric: "congestion", limit: 1 },
        });
        if (!alive) return;
        const pts = r.data?.points || [];
        const v = pts.length ? Number(pts[pts.length - 1].value) : null;
        setCongestionLatest(Number.isFinite(v) ? v : null);
      } catch {
        if (!alive) return;
        setCongestionLatest(null);
      }
    };

    loadCongestion();
    const t = setInterval(loadCongestion, refreshMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [simTick, refreshMs]);

  const k = overview?.kpis;

  const latestTsLabel = useMemo(() => {
    if (!overview?.ts) return "";
    try {
      return `Latest interval: ${new Date(overview.ts).toLocaleString()}`;
    } catch {
      return "";
    }
  }, [overview?.ts]);

  const occupancyValue = useMemo(() => {
    const n = Number(k?.currentOccupancy);
    return Number.isFinite(n) ? String(Math.round(n)) : "—";
  }, [k?.currentOccupancy]);

  const tempValue = useMemo(() => {
    const n = Number(k?.averageTemperatureC);
    return Number.isFinite(n) ? n.toFixed(2) : "—";
  }, [k?.averageTemperatureC]);

  const crowdFlowValue = useMemo(() => {
    const n = Number(k?.crowdFlowEfficiencyPct);
    return Number.isFinite(n) ? `${Math.round(n)}%` : "—";
  }, [k?.crowdFlowEfficiencyPct]);

  const congestionValue = useMemo(() => {
    if (congestionLatest === null) return "—";
    return congestionLatest.toFixed(2);
  }, [congestionLatest]);

  const tooltipText = {
    currentOccupancy: "Live people count detected across the venue for the latest interval.",
    averageTemperature: "Average indoor temperature across the monitored venue in the latest interval.",
    crowdFlow: "Flow efficiency derived from the congestion index. Higher values mean movement is smoother.",
    congestion: "Latest congestion index from crowd movement analytics. Lower values mean less congestion.",
    alerts: "Alert trend for the selected time range so you can spot spikes and recurring operational issues.",
    devices: "Live breakdown of device health and status across the venue.",
    comfortIndex: "Combined comfort score based on environmental conditions and crowd comfort penalties.",
    busiestHalls: "Ranks halls by current occupancy ratio so the busiest areas are visible at a glance.",
  };

  return (
    <div className="opsTheme">
      <div className="dashboardWrap">
        {error ? (
          <div className="card" style={{ borderColor: "rgba(232,72,111,.35)" }}>
            <div className="cardInner">
              <p className="cardTitle">Error</p>
              <p className="cardSub" style={{ fontFamily: "monospace" }}>
                {error}
              </p>
            </div>
          </div>
        ) : null}

        <div className="topRow">
          <KpiCard
            title="Current Occupancy"
            tooltip={tooltipText.currentOccupancy}
            value={occupancyValue}
            sub={latestTsLabel}
            icon={<IcoPeople />}
          />
          <KpiCard
            title="Average Temp (°C)"
            tooltip={tooltipText.averageTemperature}
            value={tempValue}
            sub="Current interval"
            icon={<IcoThermo />}
          />
          <KpiCard
            title="Crowd Flow"
            tooltip={tooltipText.crowdFlow}
            value={crowdFlowValue}
            sub="Derived from congestion index"
            icon={<IcoFlow />}
          />
          <KpiCard
            title="Congestion"
            tooltip={tooltipText.congestion}
            value={congestionValue}
            sub="Current interval"
            icon={<IcoAlert />}
          />
        </div>

        <div className="grid3">
          <CardShell
            title="Alerts"
            tooltip={tooltipText.alerts}
            right={<AlertsRangeSelect value={alertsRange} onChange={setAlertsRange} />}
            icon={<IcoAlert />}
          >
            <AlertsTrendPanel embedded range={alertsRange} />
          </CardShell>

          <CardShell title="Devices" tooltip={tooltipText.devices} right="Now" icon={<IcoDevices />}>
            <DevicesStatusBars embedded />
          </CardShell>

          <CardShell title="Comfort Index" tooltip={tooltipText.comfortIndex} right="Current interval" icon={<IcoComfort />}>
            <ComfortGauge value={k ? k.comfortIndex : null} embedded />
          </CardShell>
        </div>

        <div className="floatRow">
          <CardShell title="Busiest Halls" tooltip={tooltipText.busiestHalls} icon={<IcoBusyHalls />}>
            <TopHallsBar title={null} limit={8} embedded />
          </CardShell>
        </div>

        <AiSimulateSurge onSimulated={() => setSimTick((t) => t + 1)} />

        <div className="opsAiStack">
          <PredictedOccupancyChart refreshSignal={simTick} />
          <AiOpsPanel />
        </div>
      </div>
    </div>
  );
}