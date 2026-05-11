export const REPORT_DOMAIN_CONFIG = {
  operations: {
    title: "Generate Report",
    themeClass: "socTheme",
    accent: "#123150",
    listPath: "/operations/reports",
    sections: [
      { value: "hall_utilization", label: "Hall Utilization Ranking" },
      { value: "event_impact", label: "Event Impact Analysis" },
      { value: "peak_congestion", label: "Peak Congestion Windows" },
      { value: "stress_index", label: "Operational Stress Index" },
    ],
    defaultSections: ["hall_utilization", "event_impact", "peak_congestion", "stress_index"],
    frequencyOptions: ["Hourly", "Daily", "Weekly", "Monthly"],
    requiresExhibitorScope: false,
  },
  sustainability: {
    title: "Generate Report",
    themeClass: "sustTheme",
    accent: "#00802B",
    listPath: "/sustainability/reports",
    sections: [
      { value: "energy", label: "Energy Consumption" },
      { value: "environment", label: "Environmental Conditions" },
      { value: "occupancy", label: "Occupancy Overview" },
    ],
    defaultSections: ["energy", "environment", "occupancy"],
    frequencyOptions: ["Hourly", "Daily", "Weekly", "Monthly"],
    requiresExhibitorScope: false,
  },
  exhibitors: {
    title: "Generate Report",
    themeClass: "exhTheme",
    accent: "#35005C",
    listPath: "/exhibitor/reports",
    sections: [
      { value: "booth_profile", label: "Exhibitor Profile" },
      { value: "traffic_overview", label: "Booth Traffic Overview" },
      { value: "engagement_analysis", label: "Visitor Engagement Analysis" },
      { value: "time_analysis", label: "Operating Environment Analysis" },
      { value: "performance_breakdown", label: "Performance Breakdown" },
    ],
    defaultSections: ["booth_profile", "traffic_overview", "engagement_analysis", "time_analysis", "performance_breakdown"],
    frequencyOptions: ["Hourly", "Daily", "Weekly", "Monthly"],
    requiresExhibitorScope: true,
  },
  soc: {
    title: "Generate Report",
    themeClass: "socTheme",
    accent: "#123150",
    listPath: "/soc/reports",
    sections: [
      { value: "incident_summary", label: "Incident Summary" },
      { value: "critical_alerts", label: "Critical Alerts Overview" },
      { value: "device_health", label: "Device Health Snapshot" },
      { value: "audit_activity", label: "Audit Activity Review" },
    ],
    defaultSections: ["incident_summary", "critical_alerts", "device_health", "audit_activity"],
    frequencyOptions: ["Hourly", "Daily", "Weekly", "Monthly"],
    requiresExhibitorScope: false,
  },
};

export function getDomainFromPath(pathname = "") {
  if (pathname.startsWith("/sustainability")) return "sustainability";
  if (pathname.startsWith("/operations")) return "operations";
  if (pathname.startsWith("/soc")) return "soc";
  if (pathname.startsWith("/exhibitor")) return "exhibitors";
  return "operations";
}

export function formatReportStatus(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "GENERATED") return "generated";
  if (normalized === "DRAFT") return "draft";
  return normalized || "Unknown";
}
