/**
 * Provides the main application layout for role-based dashboard pages, including
 * sidebar navigation, page header, logout flow, help access, settings modal,
 * live alerts, and assistant access. This layout renders routed page content
 * with Outlet, and integrates SettingsPage, FloatingAssistant, LiveAlertOverlay,
 * HelpSupportModal, and LogoutConfirmModal.
 */

// frontend/src/layout/AppLayout.jsx
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import SettingsPage from "../pages/SettingsPage";
import FloatingAssistant from "../components/FloatingAssistant";
import LogoutConfirmModal from "../components/LogoutConfirmModal";
import LiveAlertOverlay from "../components/LiveAlertOverlay";
import HelpSupportModal from "../components/HelpSupportModal";

const rolePrefixMap = {
  operations_manager: "/operations",
  sustainability_manager: "/sustainability",
  soc_analyst: "/soc",
  exhibitor: "/exhibitor",
};

const IconSize = 20;
const SIDEBAR_STORAGE_KEY = "sentina.sidebarCollapsed";
const HELP_GUIDE_PATHS = {
  operations: "/guides/operations-user-guide.pdf",
  sustainability: "/guides/sustainability-user-guide.pdf",
  soc: "/guides/soc-user-guide.pdf",
};

function getSectionFromPath(pathname) {
  if (pathname.startsWith("/sustainability")) return "sustainability";
  if (pathname.startsWith("/operations")) return "operations";
  if (pathname.startsWith("/soc")) return "soc";
  if (pathname.startsWith("/exhibitor")) return "exhibitor";
  return null;
}

function getPageTitle(pathname) {
  if (pathname === "/sustainability" || pathname === "/sustainability/") return "Dashboard";
  if (pathname.startsWith("/sustainability/devices")) return "Devices";
  if (pathname.startsWith("/sustainability/alerts")) return "Alerts";
  if (pathname.startsWith("/sustainability/energy")) return "Energy";
  if (pathname.startsWith("/sustainability/environment")) return "Environmental";
  if (pathname.startsWith("/sustainability/map")) return "Navigation";
  if (pathname.startsWith("/sustainability/reports/new")) return "Generate Report";
  if (pathname.startsWith("/sustainability/reports/") && pathname.endsWith("/edit")) return "Edit Report Draft";
  if (pathname.startsWith("/sustainability/reports")) return "Reports";

  if (pathname === "/operations" || pathname === "/operations/") return "Dashboard";
  if (pathname.startsWith("/operations/devices")) return "Devices";
  if (pathname.startsWith("/operations/events")) return "Events";
  if (pathname.startsWith("/operations/exhibitors")) return "Exhibitors";
  if (pathname.startsWith("/operations/booths")) return "Booths";
  if (pathname.startsWith("/operations/alerts")) return "Alerts";
  if (pathname.startsWith("/operations/navigation")) return "Navigation";
  if (pathname.startsWith("/operations/reports/new")) return "Generate Report";
  if (pathname.startsWith("/operations/reports/") && pathname.endsWith("/edit")) return "Edit Report Draft";
  if (pathname.startsWith("/operations/reports")) return "Reports";

  if (pathname === "/soc" || pathname === "/soc/") return "Dashboard";
  if (pathname.startsWith("/soc/devices")) return "Devices";
  if (pathname.startsWith("/soc/alerts/")) return "Alert Details";
  if (pathname.startsWith("/soc/alerts")) return "Alerts";
  if (pathname.startsWith("/soc/analytics")) return "Analytics";
  if (pathname.startsWith("/soc/map")) return "Digital Twin";
  if (pathname.startsWith("/soc/logs")) return "Security Logs";
  if (pathname.startsWith("/soc/reports/new")) return "Generate Report";
  if (pathname.startsWith("/soc/reports/") && pathname.endsWith("/edit")) return "Edit Report Draft";
  if (pathname.startsWith("/soc/reports")) return "Reports";
  if (pathname.startsWith("/soc/digital-twin")) return "Digital Twin";
  if (pathname.startsWith("/exhibitor")) return "Exhibitor Portal";

  if (pathname.startsWith("/sustainability/digital-twin")) return "Digital Twin";
  if (pathname.startsWith("/operations/digital-twin")) return "Digital Twin";

  if (pathname.startsWith("/sustainability/settings")) return "Settings";
  if (pathname.startsWith("/operations/settings")) return "Settings";

  return "SentinaAI";
}

function formatHeaderClock(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const iconStyle = {
  width: 18,
  height: 18,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 6,
  background: "#f3f4f6",
  fontSize: 12,
};

function SvgIcon({ children }) {
  return (
    <span
      style={{
        ...iconStyle,
        color: "inherit",
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

/* ===== Sustainability nav icons ===== */
function EnergyNavIcon() {
  return (
    <svg width={IconSize} height={IconSize} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M18.4164 31H29.5837C30.0096 30.0175 30.5783 29.0337 31.1077 28.1972C31.9501 26.8663 32.8498 25.6684 33.3793 25.0221C34.7882 23.2987 35.668 21.225 35.9229 19.0407C36.1778 16.8563 35.798 14.6443 34.8245 12.6584C33.8509 10.6721 32.3213 8.98968 30.4066 7.80939C28.4915 6.62888 26.2713 6.00036 24.0019 6C21.7326 5.99964 19.5121 6.62747 17.5967 7.80738C15.6816 8.98707 14.1514 10.6691 13.1771 12.6551C12.203 14.6407 11.8225 16.8525 12.0767 19.037C12.3308 21.2216 13.2102 23.2957 14.6187 25.0197C15.1472 25.6656 16.0473 26.8635 16.8906 28.1951C17.4206 29.032 17.9901 30.0165 18.4164 31ZM34.9273 26.2885C36.5762 24.2717 37.6099 21.8396 37.9094 19.2725C38.209 16.7053 37.7621 14.1074 36.6204 11.7782C35.4787 9.44891 33.6885 7.48298 31.4561 6.10687C29.2237 4.73075 26.6398 4.00041 24.0022 4C21.3646 3.99959 18.7806 4.72911 16.5477 6.10453C14.3149 7.47995 12.524 9.44531 11.3816 11.7742C10.2391 14.1031 9.79137 16.7008 10.0901 19.2681C10.3888 21.8354 11.4217 24.2678 13.0699 26.2851C14.0324 27.4611 16.4803 30.8176 17 33H31C31.5197 30.8193 33.9648 27.4628 34.9273 26.2885Z"
        fill="currentColor"
      />
      <path d="M19 21L25 12V18H29L23 27L23 21H19Z" fill="currentColor" />
      <path d="M17 35H31V37H17V35Z" fill="currentColor" />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M29 41H19L19 42H29V41ZM17 39V42C17 43.1046 17.8954 44 19 44H29C30.1046 44 31 43.1046 31 42V39H17Z"
        fill="currentColor"
      />
    </svg>
  );
}

function EnvironmentalNavIcon() {
  return (
    <svg width={IconSize} height={IconSize} viewBox="-63 65 128 128" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M47.7,172.8c-0.5-2.2-0.1-4.7,1.2-6.8l10.5-16.7c2.5-4,3.1-9.1,2-13.5l-8.2-36.1c-0.6-2.9-3.5-4.8-6.5-4.1 c-2.9,0.6-4.7,3.5-4,6.5l5.1,22.2c1.1,0.2,2.2,0.6,3.1,1.3c2,1.3,3.5,3.3,4,5.6c0.5,2.3,0.1,4.8-1.2,6.8l-12.1,19.2 c-0.5,0.8-1.6,1.2-2.5,0.5c-0.8-0.5-1.2-1.6-0.5-2.4L50.8,136c1.6-2.5,0.8-5.8-1.7-7.4c-2.5-1.6-5.8-0.8-7.4,1.7l-15.2,24.1 c-2.5,3.9-4.4,8.5-2.2,12.9l15.1,24.4l24.6-0.1L47.7,172.8z M-39.4,130.3c-1.6-2.5-4.9-3.3-7.4-1.7c-2.5,1.6-3.3,4.9-1.7,7.4 l12.2,19.3c0.5,0.7,0.3,1.9-0.5,2.4c-0.8,0.5-1.9,0.3-2.5-0.5l-12.2-19.2c-1.4-2-1.7-4.5-1.2-6.8s2-4.4,4-5.6c1-0.6,2-1.1,3.1-1.3 l5.1-22.2c0.6-3-1.2-5.8-4-6.5c-3-0.6-5.8,1.3-6.5,4.1l-8.3,36.1c-1.1,4.2-0.5,9.3,2,13.5l10.5,16.7c1.3,2.1,1.7,4.6,1.2,6.8 l-16.3,18.6l24.6,0.1l15.1-24.4c2.2-4.4,0.3-8.8-2.2-12.9L-39.4,130.3z M33.1,114.8C32,97,16.6,83.5-1.1,84.7 c-17.8,1.1-31.3,16.5-30.2,34.2c1.1,17.8,16.5,31.3,34.2,30.2C20.7,148,34.1,132.7,33.1,114.8z" />
    </svg>
  );
}

function NavigationNavIcon() {
  return (
    <svg width={IconSize} height={IconSize} viewBox="0 0 34 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M11.3332 18L1.4165 22V6L11.3332 2M11.3332 18L22.6665 22M11.3332 18V2M22.6665 22L32.5832 18V2L22.6665 6M22.6665 22V6M22.6665 6L11.3332 2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DigitalTwinNavIcon() {
  return (
    <svg width={IconSize} height={IconSize} viewBox="0 0 31.984 31.984" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M25.949,15.091V4.192l-2.797-0.884V2.241L16.427,0l-5.594,1.587v0.965L8.147,3.279v10.168l-6.011,0.82v16.692l8.456,1.025l0.018-0.026l1.495-0.181v-4.725l2.363-0.139v4.577l1.608-0.202v-4.482l2.115-0.123v4.344l1.03-0.108l-0.012-8.249h4.011v7.495l1.471-0.181v-3.821l1.622-0.091v3.716l1.114-0.138v-3.651l1.479-0.083v3.555l0.942-0.115V15.597L25.949,15.091z M3.985,25.559l-1.229-0.051v-1.096l1.229,0.029V25.559z M3.985,23.627l-1.229-0.016v-1.096l1.229-0.006V23.627z M3.995,21.734l-1.229,0.02v-1.097l1.229-0.039V21.734z M3.995,19.865l-1.229,0.054v-1.097l1.229-0.073V19.865z M3.995,17.9l-1.229,0.091v-1.097l1.229-0.109V17.9z M5.942,25.607l-1.3-0.053v-1.128l1.3,0.031V25.607z M5.942,23.62l-1.3-0.017v-1.127l1.3-0.006V23.62z M5.953,21.672l-1.301,0.021v-1.129l1.301-0.041V21.672z M5.953,19.748l-1.301,0.059V18.68l1.301-0.08V19.748z M5.953,17.729l-1.301,0.096v-1.129l1.301-0.115V17.729z M7.92,25.699l-1.375-0.057v-1.158l1.375,0.033V25.699z M7.92,23.655l-1.375-0.019v-1.158l1.375-0.006V23.655z M7.932,21.65l-1.375,0.021v-1.158l1.375-0.045V21.65z M7.932,19.673l-1.375,0.06v-1.157l1.375-0.083V19.673z M7.932,17.594l-1.375,0.102v-1.159l1.375-0.123V17.594z M9.244,4.706l1.57-0.388v2.407l-1.57,0.337V4.706z M9.243,8.485l1.57-0.307v2.407l-1.57,0.256V8.485z M10.053,25.792l-1.457-0.06V24.54l1.457,0.035V25.792z M10.053,23.688l-1.457-0.019v-1.192l1.457-0.007V23.688z M10.067,21.622l-1.458,0.022v-1.191l1.458-0.048V21.622z M10.067,19.585l-1.458,0.063v-1.193l1.458-0.088V19.585z M10.067,17.443L8.609,17.55v-1.192l1.458-0.131V17.443z M10.825,13.207l-0.373-0.048l-1.197,0.149v-0.967l1.57-0.224V13.207z M15.48,19.79v-1.203l1.286,0.078v1.181L15.48,19.79z M16.744,20.564v1.182l-1.288-0.02v-1.203L16.744,20.564z M16.755,16.734v1.182l-1.287-0.093v-1.202L16.755,16.734z M15.75,13.83l-1.783-0.226v-1.906l1.783-0.253V13.83z M13.955,3.568l1.782-0.439v2.566l-1.782,0.382V3.568z M13.954,7.592l1.782-0.347v2.566L13.954,10.1V7.592z M11.597,4.13l1.675-0.414v2.487l-1.675,0.36V4.13z M11.597,8.031l1.675-0.327v2.487l-1.675,0.272V8.031z M11.341,16.232l1.443,0.129v1.25l-1.443-0.104V16.232z M11.38,18.346l1.441,0.088v1.248l-1.441-0.062V18.346z M12.834,20.379v1.249l-1.441-0.022v-1.273L12.834,20.379z M11.393,22.463l1.441,0.007v1.249l-1.441,0.02V22.463z M12.864,25.764l-1.44-0.061V24.55l1.44,0.035V25.764z M13.283,13.518l-1.675-0.212v-1.294l1.675-0.238V13.518z M13.533,16.445l1.359,0.121v1.213l-1.359-0.098V16.445z M13.545,18.467l1.359,0.083v1.212l-1.359-0.059V18.467z M14.916,20.464v1.213l-1.358-0.021V20.42L14.916,20.464z M13.558,22.488l1.358,0.006v1.213l-1.358,0.018V22.488z M14.932,25.673l-1.357,0.058v-1.236l1.357-0.032V25.673z M15.455,22.538l1.289,0.005v1.182l-1.289,0.018V22.538z M16.775,25.611l-1.286,0.054v-1.202l1.286-0.031V25.611z M17.25,3.143l1.728,0.503v2.426l-1.728-0.45V3.143z M17.307,7.36l1.726,0.395v2.423l-1.726-0.341V7.36z M18.584,18.036l-1.218-0.088v-1.171l1.218,0.108V18.036z M18.595,18.766v1.147l-1.217-0.054v-1.168L18.595,18.766z M18.574,20.614v1.147l-1.217-0.019v-1.17L18.574,20.614z M18.574,22.538v1.147l-1.219,0.018v-1.17L18.574,22.538z M18.598,25.562l-1.218,0.051v-1.17l1.218-0.029V25.562z M19.045,14.224l-1.724-0.235v-2.476l1.724,0.287V14.224z M28.294,17.707l0.855,0.077v0.964l-0.855-0.062V17.707z M29.158,19.359v0.966l-0.855-0.038v-0.979L29.158,19.359z M28.287,20.885l0.855,0.028v0.965l-0.855-0.014V20.885z M26.97,17.598l0.896,0.08v0.986L26.97,18.6V17.598z M27.873,19.291v0.986l-0.896-0.039v-1.002L27.873,19.291z M26.961,20.85l0.896,0.03v0.986l-0.896-0.015V20.85z M21.949,4.501l1.496,0.436v2.261l-1.496-0.392V4.501z M23.492,8.765v2.259l-1.494-0.297V8.423L23.492,8.765z M21.373,12.195v2.337l-1.603-0.219v-2.386L21.373,12.195z M21.361,10.631l-1.604-0.317V7.927l1.604,0.367V10.631z M19.705,3.864l1.604,0.467V6.67l-1.604-0.418V3.864z M23.26,21.816l-4.038-0.035v-1.135l4.038,0.102V21.816z M23.297,20.136l-4.086-0.204v-1.134l4.086,0.271V20.136z M23.316,18.348l-4.104-0.267v-1.134l4.104,0.332V18.348z M23.503,14.793l-1.494-0.205v-2.303l1.494,0.249V14.793z M24.098,5.135l1.396,0.407v2.184l-1.396-0.364V5.135z M25.539,9.241v2.183l-1.396-0.277V8.922L25.539,9.241z M24.132,17.326l0.986,0.089v1.035l-0.986-0.072V17.326z M24.158,19.068l0.985,0.061v1.033l-0.985-0.043V19.068z M25.154,20.74v1.033l-0.985-0.018v-1.051L25.154,20.74z M24.167,22.466l0.984,0.007v1.032l-0.984,0.013V22.466z M25.172,25.199l-0.984,0.039v-1.051l0.984-0.022V25.199z M25.549,15.066l-1.394-0.191v-2.224l1.394,0.232V15.066z M25.632,17.475l0.938,0.084v1.01L25.632,18.5V17.475z M25.641,19.15l0.938,0.059v1.009l-0.938-0.041V19.15z M26.587,20.802v1.011l-0.938-0.018V20.77L26.587,20.802z M25.65,22.486l0.938,0.006v1.009l-0.938,0.011V22.486z M26.598,25.137l-0.938,0.038V24.15l0.938-0.022V25.137z M26.96,22.527l0.896,0.005v0.987l-0.896,0.012V22.527z M27.879,25.098l-0.896,0.036v-1.002l0.896-0.021V25.098z M28.285,22.523l0.856,0.004v0.966l-0.856,0.011V22.523z M29.16,25.066l-0.855,0.035v-0.979l0.855-0.02V25.066Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ReportsNavIcon() {
  return (
    <svg width={IconSize} height={IconSize} viewBox="0 0 24 22" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M20.1667 6.41667V20.5H2.91667V6.41667M9.625 10.75H13.4583M1 1H22.0833V6.41667H1V1Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ToggleChevronIcon({ collapsed }) {
  return collapsed ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ display: "block" }}>
      <path d="m15 6-6 6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SidebarText({ collapsed, children }) {
  return (
    <span
      style={{
        display: "inline-block",
        maxWidth: collapsed ? 0 : 180,
        opacity: collapsed ? 0 : 1,
        overflow: "hidden",
        whiteSpace: "nowrap",
        transform: `translateX(${collapsed ? "-6px" : "0"})`,
        transition: "max-width 280ms ease, opacity 180ms ease, transform 280ms ease",
        pointerEvents: collapsed ? "none" : "auto",
      }}
    >
      {children}
    </span>
  );
}

function SidebarBrand({ collapsed }) {
  return (
    <div
      style={{
        position: "relative",
        height: 34,
        marginBottom: 18,
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "flex-start",
        overflow: "hidden",
        lineHeight: 1,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "baseline",
          gap: 0,
          maxWidth: collapsed ? 0 : 220,
          opacity: collapsed ? 0 : 1,
          overflow: "hidden",
          whiteSpace: "nowrap",
          transform: `translateY(${collapsed ? "-4px" : "0"})`,
          transition: "max-width 280ms ease, opacity 180ms ease, transform 280ms ease",
          fontFamily: "'Oxanium', sans-serif",
          fontSize: 28,
          letterSpacing: "-0.5px",
        }}
      >
        <span style={{ fontWeight: 500 }}>Sentina</span>
        <span style={{ fontWeight: 800 }}>AI</span>
      </span>

      <span
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: collapsed ? "center" : "flex-start",
          opacity: collapsed ? 1 : 0,
          transform: `translateY(${collapsed ? "0" : "4px"})`,
          transition: "opacity 180ms ease, transform 280ms ease",
          pointerEvents: "none",
          fontFamily: "'Oxanium', sans-serif",
          fontSize: 28,
          letterSpacing: "-0.5px",
        }}
      >
        <span style={{ fontWeight: 500 }}>s</span>
        <span style={{ fontWeight: 800 }}>AI</span>
      </span>
    </div>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const pathname = location.pathname;
  const section = getSectionFromPath(pathname);
  const storedRole = localStorage.getItem("role") || sessionStorage.getItem("role") || "operations_manager";

  const [now, setNow] = useState(new Date());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [sidebarCollapsed]);

  const rolePrefix =
    section === "sustainability"
      ? "/sustainability"
      : section === "operations"
        ? "/operations"
        : rolePrefixMap[storedRole] || "/operations";

  const helpGuidePath =
    section === "sustainability"
      ? HELP_GUIDE_PATHS.sustainability
      : section === "soc"
        ? HELP_GUIDE_PATHS.soc
        : HELP_GUIDE_PATHS.operations;

  const openHelpGuide = () => {
    setShowHelpModal(true);
  };

  const isSust = section === "sustainability";
  const isOperations = section === "operations";
  const isSoc = section === "soc";

  const ACCENT = isSust ? "#00802B" : isSoc ? "#123150" : "#E8486F";
  const ACCENT_BG = isSust ? "rgba(0,128,43,0.08)" : isSoc ? "rgba(18,49,80,0.10)" : "rgba(232,72,111,0.08)";

  const navItemStyle = ({ isActive }) => ({
    display: "flex",
    alignItems: "center",
    justifyContent: sidebarCollapsed ? "center" : "flex-start",
    gap: sidebarCollapsed ? 0 : 10,
    minHeight: 48,
    padding: sidebarCollapsed ? "10px 0" : "10px 12px",
    borderRadius: 10,
    textDecoration: "none",
    color: isActive ? ACCENT : "#111827",
    background: isActive ? ACCENT_BG : "transparent",
    fontWeight: isActive ? 700 : 600,
    marginBottom: 6,
    overflow: "hidden",
    transition:
      "background 220ms ease, color 220ms ease, padding 280ms ease, gap 280ms ease, transform 180ms ease",
  });

  const handleLogoutClick = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    setShowLogoutConfirm(true);
  };

  const handleLogoutCancel = () => {
    setShowLogoutConfirm(false);
  };

  const handleLogoutConfirm = () => {
    const preservedSidebar = localStorage.getItem("sentina.sidebarCollapsed");

    localStorage.clear();
    sessionStorage.clear();

    if (preservedSidebar !== null) {
      localStorage.setItem("sentina.sidebarCollapsed", preservedSidebar);
    }

    window.location.replace("/");
  };

  const styles = {
    shell: {
      display: "grid",
      gridTemplateColumns: sidebarCollapsed ? "96px 1fr" : "260px 1fr",
      height: "100vh",
      background: "#f6f7fb",
      color: "#111827",
      transition: "grid-template-columns 280ms ease",
    },
    sidebar: {
      position: "relative",
      padding: sidebarCollapsed ? "22px 12px 18px" : "22px 18px 18px",
      background: "#ffffff",
      borderRight: "1px solid #e5e7eb",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      transition: "padding 280ms ease",
      overflow: "visible",
      zIndex: 3,
    },
    brand: {
      fontSize: 28,
      fontWeight: 900,
      letterSpacing: "-0.5px",
      marginBottom: 18,
    },
    sectionLabel: {
      fontSize: 12,
      fontWeight: 800,
      opacity: 0.55,
      marginTop: 6,
      marginBottom: 8,
      textAlign: sidebarCollapsed ? "center" : "left",
      transition: "text-align 280ms ease, opacity 180ms ease",
    },
    toggleBtn: {
      position: "absolute",
      top: 22,
      right: -14,
      width: 28,
      height: 28,
      padding: 0,
      borderRadius: 9,
      border: "1.5px solid #d1d5db",
      background: "#ffffff",
      color: "#0f172a",
      boxShadow: "0 6px 16px rgba(15, 23, 42, 0.10)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      lineHeight: 0,
      cursor: "pointer",
      zIndex: 20,
    },
    main: {
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
      minHeight: 0,
      overflow: "hidden",
    },
    content: {
      flex: 1,
      minHeight: 0,
      overflowY: "auto",
      overflowX: "hidden",
      padding: "0 22px 22px",
    },
    header: {
      padding: "18px 22px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexShrink: 0,
    },
    pageTitle: { fontSize: 20, fontWeight: 900, color: ACCENT },
    subTitle: { marginTop: 4, fontSize: 12, opacity: 0.65 },
    headerRight: { display: "flex", alignItems: "center", gap: 14 },
    userCard: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "8px 10px",
      borderRadius: 14,
      background: "#ffffff",
      border: "1px solid #e5e7eb",
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 999,
      background: "#111827",
      color: "white",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: 900,
    },
    logoutBtn: {
      marginTop: 10,
      minHeight: 48,
      padding: sidebarCollapsed ? "10px 0" : "10px 12px",
      borderRadius: 10,
      border: "1px solid #f8c7c7",
      background: "#fff5f5",
      color: "#e0565b",
      fontWeight: 800,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: sidebarCollapsed ? "center" : "flex-start",
      gap: sidebarCollapsed ? 0 : 10,
      overflow: "hidden",
      transition:
        "background 220ms ease, color 220ms ease, padding 280ms ease, gap 280ms ease",
    },
  };

  return (
    <div className={section === "soc" ? "socLayout" : ""} style={styles.shell}>
      <aside style={styles.sidebar}>
        <button
          type="button"
          style={styles.toggleBtn}
          onClick={() => setSidebarCollapsed((prev) => !prev)}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ToggleChevronIcon collapsed={sidebarCollapsed} />
        </button>

        <SidebarBrand collapsed={sidebarCollapsed} />

        <div style={styles.sectionLabel}>MAIN</div>

        <NavLink to={rolePrefix} end style={navItemStyle} title={sidebarCollapsed ? "Dashboard" : undefined}>
          <SvgIcon>
            <svg width="18" height="18" viewBox="0 0 20 21" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M7 19.3333V10.1667H13V19.3333M1 7.41667L10 1L19 7.41667V17.5C19 17.9862 18.7893 18.4525 18.4142 18.7964C18.0391 19.1402 17.5304 19.3333 17 19.3333H3C2.46957 19.3333 1.96086 19.1402 1.58579 18.7964C1.21071 18.4525 1 17.9862 1 17.5V7.41667Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </SvgIcon>
          <SidebarText collapsed={sidebarCollapsed}>Dashboard</SidebarText>
        </NavLink>

        <NavLink to={`${rolePrefix}/devices`} style={navItemStyle} title={sidebarCollapsed ? "Devices" : undefined}>
          <SvgIcon>
            <svg width={IconSize} height={IconSize} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M27.0347 17.3792H23.1726V13.5171H21.2415V22.2068H5.79314V6.75845L14.4829 6.75758V4.82741H10.6208V0.965332H8.68971V4.82741H5.79314C5.28115 4.82792 4.79028 5.03153 4.42825 5.39356C4.06622 5.75559 3.8626 6.24646 3.86209 6.75845V9.655H0V11.586H3.86209V17.3792H0V19.3102H3.86209V22.2068C3.86268 22.7187 4.06632 23.2095 4.42833 23.5716C4.79035 23.9336 5.28118 24.1372 5.79314 24.1378H8.68971V27.9999H10.6208V24.1378H16.4139V27.9999H18.3449V24.1378H21.2415C21.7534 24.1371 22.2442 23.9334 22.6062 23.5714C22.9682 23.2094 23.1719 22.7187 23.1726 22.2068V19.3102H27.0347V17.3792Z"
                fill="currentColor"
              />
              <path d="M18.3447 19.3105H8.68945V9.65527H18.3447V19.3105ZM10.6205 17.3794H16.4136V11.5863H10.6205V17.3794Z" fill="currentColor" />
              <path
                d="M28.0003 11.5862H26.0693C26.0663 9.02643 25.0481 6.57233 23.238 4.76228C21.428 2.95223 18.9739 1.93403 16.4141 1.93104V0C19.4859 0.00334794 22.431 1.22511 24.6031 3.39723C26.7752 5.56934 27.997 8.5144 28.0003 11.5862Z"
                fill="currentColor"
              />
              <path
                d="M23.1727 11.5863H21.2417C21.2402 10.3064 20.7311 9.07933 19.826 8.17431C18.921 7.26929 17.694 6.76018 16.4141 6.75867V4.82764C18.2059 4.82981 19.9237 5.54257 21.1908 6.80959C22.4578 8.07661 23.1706 9.79444 23.1727 11.5863Z"
                fill="currentColor"
              />
            </svg>
          </SvgIcon>
          <SidebarText collapsed={sidebarCollapsed}>Devices</SidebarText>
        </NavLink>

        <NavLink to={`${rolePrefix}/alerts`} style={navItemStyle} title={sidebarCollapsed ? "Alerts" : undefined}>
          <SvgIcon>
            <svg width={IconSize} height={IconSize} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M11.9998 8.99999V13M11.9998 17H12.0098M10.6151 3.89171L2.39019 18.0983C1.93398 18.8863 1.70588 19.2803 1.73959 19.6037C1.769 19.8857 1.91677 20.142 2.14613 20.3088C2.40908 20.5 2.86435 20.5 3.77487 20.5H20.2246C21.1352 20.5 21.5904 20.5 21.8534 20.3088C22.0827 20.142 22.2305 19.8857 22.2599 19.6037C22.2936 19.2803 22.0655 18.8863 21.6093 18.0983L13.3844 3.89171C12.9299 3.10654 12.7026 2.71396 12.4061 2.58211C12.1474 2.4671 11.8521 2.4671 11.5935 2.58211C11.2969 2.71396 11.0696 3.10655 10.6151 3.89171Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </SvgIcon>
          <SidebarText collapsed={sidebarCollapsed}>Alerts</SidebarText>
        </NavLink>

        {isSoc && (
          <>
            <NavLink to={`${rolePrefix}/analytics`} style={navItemStyle} title={sidebarCollapsed ? "Analytics" : undefined}>
              <SvgIcon>
                <svg width={IconSize} height={IconSize} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M4 19H20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M7 16V10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M12 16V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M17 16V12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </SvgIcon>
              <SidebarText collapsed={sidebarCollapsed}>Analytics</SidebarText>
            </NavLink>

            <NavLink to={`${rolePrefix}/map`} style={navItemStyle} title={sidebarCollapsed ? "Digital Twin" : undefined}>
              <SvgIcon><DigitalTwinNavIcon /></SvgIcon>
              <SidebarText collapsed={sidebarCollapsed}>Digital Twin</SidebarText>
            </NavLink>

            <NavLink to={`${rolePrefix}/logs`} style={navItemStyle} title={sidebarCollapsed ? "Security Logs" : undefined}>
              <SvgIcon>
                <svg width={IconSize} height={IconSize} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M8 7H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M8 12H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M8 17H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
                </svg>
              </SvgIcon>
              <SidebarText collapsed={sidebarCollapsed}>Security Logs</SidebarText>
            </NavLink>
          </>
        )}

        {isOperations && (
          <>
            <NavLink to={`${rolePrefix}/events`} style={navItemStyle} title={sidebarCollapsed ? "Events" : undefined}>
              <SvgIcon>
                <svg width="100%" height="100%" viewBox="0 0 25 19" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M0.5 0.5H2V17.375H24.5V18.5H0.5V0.5ZM22.7255 4.00212C22.8018 4.04893 22.865 4.10656 22.9116 4.17171C22.9581 4.23686 22.9871 4.30825 22.9969 4.3818C23.0066 4.45536 22.9969 4.52963 22.9684 4.60038C22.9398 4.67113 22.893 4.73697 22.8305 4.79413L16.0805 10.9816C16.0142 11.0424 15.9316 11.092 15.8381 11.1274C15.7447 11.1627 15.6424 11.183 15.5378 11.1869C15.4332 11.1909 15.3288 11.1783 15.231 11.1501C15.1333 11.1219 15.0446 11.0787 14.9705 11.0233L11.09 8.11287L5.606 13.7682C5.48603 13.8827 5.31161 13.9577 5.11938 13.9777C4.92714 13.9977 4.73207 13.961 4.57516 13.8753C4.41824 13.7897 4.3117 13.6618 4.27792 13.5184C4.24413 13.3751 4.28574 13.2276 4.394 13.1068L10.394 6.91925C10.4577 6.85345 10.5396 6.79879 10.6342 6.75904C10.7288 6.71928 10.8337 6.69537 10.9418 6.68895C11.0498 6.68254 11.1585 6.69377 11.2602 6.72187C11.3619 6.74998 11.4543 6.79429 11.531 6.85175L15.4445 9.788L21.6695 4.08087C21.7319 4.02367 21.8087 3.97625 21.8956 3.94133C21.9825 3.9064 22.0777 3.88467 22.1757 3.87735C22.2738 3.87004 22.3728 3.87729 22.4672 3.8987C22.5615 3.92011 22.6493 3.95526 22.7255 4.00212Z"
                    fill="currentColor"
                    stroke="currentColor"
                  />
                </svg>
              </SvgIcon>
              <SidebarText collapsed={sidebarCollapsed}>Events</SidebarText>
            </NavLink>

            <NavLink to={`${rolePrefix}/exhibitors`} style={navItemStyle} title={sidebarCollapsed ? "Exhibitors" : undefined}>
              <SvgIcon>
                <svg width="100%" height="100%" viewBox="0 0 32 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" clipRule="evenodd" d="M7.61909 8C8.88226 8 9.90481 6.6579 9.90481 5C9.90481 3.3421 8.88226 2 7.61909 2C6.35593 2 5.33338 3.3421 5.33338 5C5.33338 6.6579 6.35593 8 7.61909 8ZM7.61909 10C9.72386 10 11.4286 7.7625 11.4286 5C11.4286 2.2375 9.72386 0 7.61909 0C5.51433 0 3.80957 2.2375 3.80957 5C3.80957 7.7625 5.51433 10 7.61909 10Z" fill="currentColor" />
                  <path fillRule="evenodd" clipRule="evenodd" d="M1.99734 15.7886C1.62706 16.2779 1.52381 16.6725 1.52381 17V20H15.2381V17C15.2381 16.6725 15.1349 16.2779 14.7646 15.7886C14.3803 15.2809 13.7821 14.7792 13.0101 14.3364C11.4581 13.4461 9.57067 13 8.38095 13C7.19124 13 5.30389 13.4461 3.75176 14.3364C2.97979 14.7792 2.38153 15.2809 1.99734 15.7886ZM8.38095 11C5.58377 11 0 13.01 0 17V22H16.7619V17C16.7619 13.01 11.1781 11 8.38095 11Z" fill="currentColor" />
                  <path fillRule="evenodd" clipRule="evenodd" d="M24.3808 8C25.644 8 26.6665 6.6579 26.6665 5C26.6665 3.3421 25.644 2 24.3808 2C23.1177 2 22.0951 3.3421 22.0951 5C22.0951 6.6579 23.1177 8 24.3808 8ZM24.3808 10C26.4856 10 28.1903 7.7625 28.1903 5C28.1903 2.2375 26.4856 0 24.3808 0C22.2761 0 20.5713 2.2375 20.5713 5C20.5713 7.7625 22.2761 10 24.3808 10Z" fill="currentColor" />
                  <path fillRule="evenodd" clipRule="evenodd" d="M16 11C13.4786 11 11.7119 12.5425 11.2054 13.2071L10.1279 11.7929C10.8914 10.7909 13.0357 9 16 9C18.9643 9 21.1087 10.7909 21.8721 11.7929L20.7946 13.2071C20.2882 12.5425 18.5214 11 16 11Z" fill="currentColor" />
                  <path fillRule="evenodd" clipRule="evenodd" d="M16 6C16.842 6 17.5236 5.1054 17.5236 4C17.5236 2.8946 16.842 2 16 2C15.1579 2 14.4762 2.8946 14.4762 4C14.4762 5.1054 15.1579 6 16 6ZM16 8C17.6838 8 19.0474 6.21 19.0474 4C19.0474 1.79 17.6838 0 16 0C14.3163 0 12.9526 1.79 12.9526 4C12.9526 6.21 14.3163 8 16 8Z" fill="currentColor" />
                  <path fillRule="evenodd" clipRule="evenodd" d="M17.2356 15.7886C16.8653 16.2779 16.7621 16.6725 16.7621 17V20H30.4764V17C30.4764 16.6725 30.3731 16.2779 30.0029 15.7886C29.6186 15.2809 29.0204 14.7792 28.2484 14.3364C26.6963 13.4461 24.8089 13 23.6192 13C22.4295 13 20.5421 13.4461 18.9901 14.3364C18.2181 14.7792 17.6198 15.2809 17.2356 15.7886ZM23.6192 11C20.8221 11 15.2383 13.01 15.2383 17V22H32.0002V17C32.0002 13.01 26.4164 11 23.6192 11Z" fill="currentColor" />
                </svg>
              </SvgIcon>
              <SidebarText collapsed={sidebarCollapsed}>Exhibitors</SidebarText>
            </NavLink>

            <NavLink to={`${rolePrefix}/booths`} style={navItemStyle} title={sidebarCollapsed ? "Booths" : undefined}>
              <SvgIcon>
                <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: "block", color: "inherit" }}>
                  <rect x="3" y="2.5" width="18" height="19" rx="4.5" stroke="currentColor" strokeWidth="2" />
                  <path d="M8 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M8 12H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <path d="M8 16H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </SvgIcon>
              <SidebarText collapsed={sidebarCollapsed}>Booths</SidebarText>
            </NavLink>

            <NavLink to={`${rolePrefix}/navigation`} style={navItemStyle} title={sidebarCollapsed ? "Navigation" : undefined}>
              <SvgIcon>
                <svg width="100%" height="100%" viewBox="0 0 34 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    d="M11.3332 18L1.4165 22V6L11.3332 2M11.3332 18L22.6665 22M11.3332 18V2M22.6665 22L32.5832 18V2L22.6665 6M22.6665 22V6M22.6665 6L11.3332 2"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </SvgIcon>
              <SidebarText collapsed={sidebarCollapsed}>Navigation</SidebarText>
            </NavLink>

            <NavLink to={`${rolePrefix}/digital-twin`} style={navItemStyle} title={sidebarCollapsed ? "Digital Twin" : undefined}>
              <SvgIcon><DigitalTwinNavIcon /></SvgIcon>
              <SidebarText collapsed={sidebarCollapsed}>Digital Twin</SidebarText>
            </NavLink>

            <NavLink to={`${rolePrefix}/reports`} style={navItemStyle} title={sidebarCollapsed ? "Reports" : undefined}>
              <SvgIcon><ReportsNavIcon /></SvgIcon>
              <SidebarText collapsed={sidebarCollapsed}>Reports</SidebarText>
            </NavLink>
          </>
        )}

        {isSust && (
          <>
            <NavLink to={`${rolePrefix}/energy`} style={navItemStyle} title={sidebarCollapsed ? "Energy" : undefined}>
              <SvgIcon><EnergyNavIcon /></SvgIcon>
              <SidebarText collapsed={sidebarCollapsed}>Energy</SidebarText>
            </NavLink>

            <NavLink to={`${rolePrefix}/environment`} style={navItemStyle} title={sidebarCollapsed ? "Environmental" : undefined}>
              <SvgIcon><EnvironmentalNavIcon /></SvgIcon>
              <SidebarText collapsed={sidebarCollapsed}>Environmental</SidebarText>
            </NavLink>

            <NavLink to={`${rolePrefix}/map`} style={navItemStyle} title={sidebarCollapsed ? "Navigation" : undefined}>
              <SvgIcon><NavigationNavIcon /></SvgIcon>
              <SidebarText collapsed={sidebarCollapsed}>Navigation</SidebarText>
            </NavLink>

            <NavLink to={`${rolePrefix}/digital-twin`} style={navItemStyle} title={sidebarCollapsed ? "Digital Twin" : undefined}>
              <SvgIcon><DigitalTwinNavIcon /></SvgIcon>
              <SidebarText collapsed={sidebarCollapsed}>Digital Twin</SidebarText>
            </NavLink>

            <NavLink to={`${rolePrefix}/reports`} style={navItemStyle} title={sidebarCollapsed ? "Reports" : undefined}>
              <SvgIcon><ReportsNavIcon /></SvgIcon>
              <SidebarText collapsed={sidebarCollapsed}>Reports</SidebarText>
            </NavLink>
          </>
        )}

        <div style={{ flex: 1 }} />

        <div style={styles.sectionLabel}>SETTINGS</div>

        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          style={{
            ...navItemStyle({ isActive: settingsOpen }),
            width: "100%",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          title={sidebarCollapsed ? "Settings" : undefined}
          aria-label="Open settings"
        >
          <SvgIcon>
            <svg width="100%" height="100%" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <g clipPath="url(#clip0-settings)">
                <path
                  d="M13.9998 17.5003C15.9328 17.5003 17.4998 15.9333 17.4998 14.0003C17.4998 12.0673 15.9328 10.5003 13.9998 10.5003C12.0668 10.5003 10.4998 12.0673 10.4998 14.0003C10.4998 15.9333 12.0668 17.5003 13.9998 17.5003Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M22.6332 17.5003C22.4779 17.8522 22.4315 18.2426 22.5002 18.621C22.5688 18.9995 22.7492 19.3487 23.0182 19.6237L23.0882 19.6937C23.3051 19.9104 23.4772 20.1677 23.5946 20.451C23.7121 20.7342 23.7725 21.0379 23.7725 21.3445C23.7725 21.6511 23.7121 21.9548 23.5946 22.238C23.4772 22.5213 23.3051 22.7786 23.0882 22.9953C22.8715 23.2123 22.6141 23.3844 22.3309 23.5018C22.0476 23.6192 21.744 23.6797 21.4373 23.6797C21.1307 23.6797 20.8271 23.6192 20.5438 23.5018C20.2605 23.3844 20.0032 23.2123 19.7865 22.9953L19.7165 22.9253C19.4415 22.6564 19.0923 22.4759 18.7139 22.4073C18.3354 22.3387 17.9451 22.385 17.5932 22.5403C17.2481 22.6882 16.9538 22.9338 16.7465 23.2468C16.5392 23.5598 16.428 23.9266 16.4265 24.302V24.5003C16.4265 25.1192 16.1807 25.7127 15.7431 26.1502C15.3055 26.5878 14.712 26.8337 14.0932 26.8337C13.4743 26.8337 12.8808 26.5878 12.4433 26.1502C12.0057 25.7127 11.7598 25.1192 11.7598 24.5003V24.3953C11.7508 24.0092 11.6258 23.6347 11.4011 23.3205C11.1764 23.0063 10.8624 22.767 10.4998 22.6337C10.148 22.4784 9.75761 22.432 9.37915 22.5007C9.00069 22.5693 8.65146 22.7497 8.3765 23.0187L8.3065 23.0887C8.0898 23.3056 7.83246 23.4777 7.5492 23.5951C7.26594 23.7126 6.96231 23.773 6.65567 23.773C6.34903 23.773 6.04541 23.7126 5.76214 23.5951C5.47888 23.4777 5.22154 23.3056 5.00484 23.0887C4.78789 22.872 4.61579 22.6146 4.49836 22.3314C4.38094 22.0481 4.3205 21.7445 4.3205 21.4378C4.3205 21.1312 4.38094 20.8276 4.49836 20.5443C4.61579 20.261 4.78789 20.0037 5.00484 19.787L5.07484 19.717C5.3438 19.442 5.52422 19.0928 5.59284 18.7143C5.66146 18.3359 5.61514 17.9455 5.45984 17.5937C5.31195 17.2486 5.06639 16.9543 4.75338 16.747C4.44038 16.5397 4.07359 16.4285 3.69817 16.427H3.49984C2.881 16.427 2.28751 16.1812 1.84992 15.7436C1.41234 15.306 1.1665 14.7125 1.1665 14.0937C1.1665 13.4748 1.41234 12.8813 1.84992 12.4437C2.28751 12.0062 2.881 11.7603 3.49984 11.7603H3.60484C3.991 11.7513 4.36551 11.6263 4.67969 11.4016C4.99386 11.1769 5.23317 10.8629 5.3665 10.5003C5.52181 10.1484 5.56813 9.7581 5.49951 9.37964C5.43089 9.00118 5.25046 8.65195 4.9815 8.37699L4.9115 8.30699C4.69456 8.09029 4.52245 7.83295 4.40503 7.54969C4.28761 7.26642 4.22717 6.9628 4.22717 6.65616C4.22717 6.34952 4.28761 6.04589 4.40503 5.76263C4.52245 5.47937 4.69456 5.22203 4.9115 5.00533C5.12821 4.78838 5.38555 4.61628 5.66881 4.49885C5.95207 4.38143 6.2557 4.32099 6.56234 4.32099C6.86897 4.32099 7.1726 4.38143 7.45587 4.49885C7.73913 4.61628 7.99647 4.78838 8.21317 5.00533L8.28317 5.07533C8.55813 5.34429 8.90736 5.52471 9.28582 5.59333C9.66428 5.66195 10.0546 5.61563 10.4065 5.46033H10.4998C10.8449 5.31244 11.1392 5.06687 11.3465 4.75387C11.5538 4.44086 11.665 4.07408 11.6665 3.69866V3.50033C11.6665 2.88149 11.9123 2.28799 12.3499 1.85041C12.7875 1.41282 13.381 1.16699 13.9998 1.16699C14.6187 1.16699 15.2122 1.41282 15.6498 1.85041C16.0873 2.28799 16.3332 2.88149 16.3332 3.50033V3.60533C16.3347 3.98074 16.4459 4.34753 16.6532 4.66054C16.8605 4.97354 17.1548 5.2191 17.4998 5.36699C17.8517 5.52229 18.2421 5.56862 18.6205 5.5C18.999 5.43138 19.3482 5.25095 19.6232 4.98199L19.6932 4.91199C19.9099 4.69505 20.1672 4.52294 20.4505 4.40552C20.7337 4.2881 21.0374 4.22766 21.344 4.22766C21.6506 4.22766 21.9543 4.2881 22.2375 4.40552C22.5208 4.52294 22.7781 4.69505 22.9948 4.91199C23.2118 5.1287 23.3839 5.38604 23.5013 5.6693C23.6187 5.95256 23.6792 6.25619 23.6792 6.56283C23.6792 6.86946 23.6187 7.17309 23.5013 7.45635C23.3839 7.73962 23.2118 7.99696 22.9948 8.21366L22.9248 8.28366C22.6559 8.55862 22.4755 8.90784 22.4068 9.28631C22.3382 9.66477 22.3845 10.0551 22.5398 10.407V10.5003C22.6877 10.8454 22.9333 11.1397 23.2463 11.347C23.5593 11.5543 23.9261 11.6655 24.3015 11.667H24.4998C25.1187 11.667 25.7122 11.9128 26.1498 12.3504C26.5873 12.788 26.8332 13.3815 26.8332 14.0003C26.8332 14.6192 26.5873 15.2127 26.1498 15.6502C25.7122 16.0878 25.1187 16.3337 24.4998 16.3337H24.3948C24.0194 16.3352 23.6526 16.4464 23.3396 16.6537C23.0266 16.861 22.7811 17.1553 22.6332 17.5003Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
              <defs>
                <clipPath id="clip0-settings">
                  <rect width="28" height="28" fill="white" />
                </clipPath>
              </defs>
            </svg>
          </SvgIcon>
          <SidebarText collapsed={sidebarCollapsed}>Settings</SidebarText>
        </button>

        {section !== "exhibitor" && (
          <button
            type="button"
            onClick={openHelpGuide}
            style={{
              ...navItemStyle({ isActive: false }),
              width: "100%",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
            title={sidebarCollapsed ? "Help" : undefined}
            aria-label="Open help guide"
          >
            <SvgIcon>
              <svg width="100%" height="100%" viewBox="0 0 28 26" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path
                  d="M10.6052 9.75033C10.8795 9.0263 11.4208 8.41577 12.1334 8.02689C12.846 7.638 13.6839 7.49584 14.4985 7.6256C15.3132 7.75535 16.0521 8.14864 16.5844 8.73581C17.1167 9.32299 17.4081 10.0661 17.4068 10.8337C17.4068 13.0003 13.9068 14.0837 13.9068 14.0837M14.0002 18.417H14.0118M25.6668 13.0003C25.6668 18.9834 20.4435 23.8337 14.0002 23.8337C7.55684 23.8337 2.3335 18.9834 2.3335 13.0003C2.3335 7.01724 7.55684 2.16699 14.0002 2.16699C20.4435 2.16699 25.6668 7.01724 25.6668 13.0003Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </SvgIcon>
            <SidebarText collapsed={sidebarCollapsed}>Help</SidebarText>
          </button>
        )}

        <button
          type="button"
          style={styles.logoutBtn}
          onClick={handleLogoutClick}
          title={sidebarCollapsed ? "Logout" : undefined}
        >
          <span style={{ ...iconStyle, color: "#e0565b" }}>
            <svg width="100%" height="100%" viewBox="0 0 27 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M10.125 21H5.625C5.02826 21 4.45597 20.7893 4.03401 20.4142C3.61205 20.0391 3.375 19.5304 3.375 19V5C3.375 4.46957 3.61205 3.96086 4.03401 3.58579C4.45597 3.21071 5.02826 3 5.625 3H10.125M18 17L23.625 12M23.625 12L18 7M23.625 12H10.125"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <SidebarText collapsed={sidebarCollapsed}>Logout</SidebarText>
        </button>
      </aside>

      <main style={styles.main}>
        <header style={styles.header}>
          <div>
            <div style={styles.pageTitle}>{getPageTitle(pathname)}</div>
            <div style={styles.subTitle}>
              {(isSust
                ? "Sustainability Dashboard"
                : section === "soc"
                  ? "Security Operations Center"
                  : section === "exhibitor"
                    ? "Exhibitor Portal"
                    : "Operations Dashboard")}{" "}
              | {formatHeaderClock(now)}
            </div>
          </div>

          <div style={styles.headerRight}>
            <div style={styles.userCard}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 13 }}>
                  {localStorage.getItem("full_name") || sessionStorage.getItem("full_name") || "User"}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  Role: {localStorage.getItem("role") || sessionStorage.getItem("role")}
                </div>
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  Employee ID: {localStorage.getItem("employee_id") || sessionStorage.getItem("employee_id")}
                </div>
              </div>
              <div style={styles.avatar}>
                {(localStorage.getItem("full_name") || sessionStorage.getItem("full_name") || "U").charAt(0).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <div style={styles.content}>
          <Outlet />
        </div>

        {section === "soc" ? (
          <style>{`
              .socLayout .devicesPage.opsTheme,
              .socLayout .alertsPage.opsTheme {
                background: #f6f9ff;
              }
              .socLayout .devicesHeaderRight .devicesCountTop,
              .socLayout .alertsHeaderRight .alertsCountTop {
                color: #123150 !important;
              }
              .socLayout .devicesTable thead th {
                color: #123150 !important;
              }
              .socLayout .devicesPage .devicesControlsCard .clearFiltersBtn,
              .socLayout .alertsPage .alertsControlsCard .clearFiltersBtn {
                color: #123150 !important;
                border-color: #bfdbfe !important;
                background: #eff6ff !important;
              }
              .socLayout .devicesPage .devicesControlsCard .clearFiltersBtn:hover,
              .socLayout .alertsPage .alertsControlsCard .clearFiltersBtn:hover {
                background: #dbeafe !important;
                border-color: #93c5fd !important;
              }
              .socLayout .alertsPage {
                --alerts-accent: #123150;
                --alerts-accent-bg: rgba(18,49,80,0.08);
                --alerts-accent-hover: #0f2740;
              }
              .socLayout .devicesPage .pillLeftIcon,
              .socLayout .devicesPage .pillRightCaret,
              .socLayout .alertsPage .pillLeftIcon,
              .socLayout .alertsPage .pillRightCaret {
                color: #123150 !important;
                border-top-color: #123150 !important;
              }
              .socLayout .devicesPage .pillSearchIcon {
                background: #123150 !important;
                color: #ffffff !important;
              }
              .socLayout .alertInfoCard h2,
              .socLayout .alertActionsTop h2 {
                color: #123150 !important;
              }
            `}</style>
        ) : null}
        {section === "operations" || section === "sustainability" || section === "soc" ? (
          <LiveAlertOverlay section={section} />
        ) : null}
        {settingsOpen ? (
          <SettingsPage
            section={section === "soc" ? "soc" : isSust ? "sustainability" : "operations"}
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}

        {section === "operations" || section === "sustainability" ? (
          <FloatingAssistant
            section={section}
            userId={
              sessionStorage.getItem("employee_id") ||
              localStorage.getItem("employee_id") ||
              sessionStorage.getItem("user_id") ||
              localStorage.getItem("user_id") ||
              section
            }
            userName={
              sessionStorage.getItem("full_name") ||
              localStorage.getItem("full_name") ||
              "User"
            }
          />
        ) : null}
      </main>
      <HelpSupportModal
        open={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        guideUrl={helpGuidePath}
        accentColor={isSust ? "#178032" : isSoc ? "#1e3a5d" : "#e9456f"}
        sectionLabel={
          isSust
            ? "Sustainability Dashboard"
            : isSoc
              ? "Security Operations Center"
              : "Operations Dashboard"
        }
      />
      <LogoutConfirmModal
        open={showLogoutConfirm}
        onConfirm={handleLogoutConfirm}
        onCancel={handleLogoutCancel}
        accentColor={isSust ? "#178032" : isSoc ? "#1e3a5d" : section === "exhibitor" ? "#37005e" : "#e9456f"}
        roleLabel={
          isSust
            ? "Sustainability Dashboard"
            : isSoc
              ? "Security Operations Center"
              : section === "exhibitor"
                ? "Exhibitor Dashboard"
                : "Operations Dashboard"
        }
      />
    </div>
  );
}