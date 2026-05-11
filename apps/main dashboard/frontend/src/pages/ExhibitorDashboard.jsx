/**
 * Displays the exhibitor dashboard overview page using shared exhibitor outlet
 * context, including KPI cards for booth assignment, AI confidence, competitive
 * density, and linked events, plus overview insights and profile details.
 * This page reads shared exhibitor data from Outlet context and uses
 * InfoTooltip for dashboard guidance.
 */

import { useOutletContext } from "react-router-dom";
import InfoTooltip from "../components/InfoTooltip";

function BoothIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 6h14v12H5V6Zm0 0 2-2h10l2 2M9 10h6M9 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ConfidenceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.4 2.8 8.4 7 9.8 4.2-1.4 7-5.4 7-9.8V6l-7-3Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m9.5 12 1.7 1.7L15 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DensityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 16.5 12 7l5 9.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 16.5h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function EventsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3v3M17 3v3M4.5 8h15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="4.5" y="5.5" width="15" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.5 12h3M8.5 15.5h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function PurpleIcon({ children }) {
  return <div className="exhIconCircle">{children}</div>;
}

function KpiCard({ title, tooltip, value, sub, icon, tone = "default", valueClassName = "" }) {
  return (
    <div className="exhCard exhKpiCard">
      <div className="exhCardInner">
        <PurpleIcon>{icon}</PurpleIcon>

        <p className="exhCardTitle">
          {title}
          <InfoTooltip text={tooltip} color="#64748b" />
        </p>

        <div className={`exhCardValue ${valueClassName}`.trim()}>{value}</div>
        <div className="exhCardMetaRow">
          {sub ? <p className="exhCardSub">{sub}</p> : null}
          {tone !== "default" ? <span className={`exhBadge is${tone}`}>{tone}</span> : null}
        </div>
      </div>
    </div>
  );
}

export default function ExhibitorDashboard() {
  const {
    exhibitorId,
    profile,
    events,
    heatmap,
    densityLatest,
    confidencePct,
    quickInsights,
    avgCatchmentEngagement,
    formatMetric,
    formatPercent,
  } = useOutletContext();

  const boothText = heatmap?.meta?.boothId || "—";
  const confidenceTone =
    confidencePct === null ? "default" : confidencePct >= 70 ? "good" : confidencePct >= 45 ? "warning" : "critical";

  const densityTone = densityLatest
    ? String(densityLatest.competitive_density_label || "").toLowerCase() === "high"
      ? "critical"
      : String(densityLatest.competitive_density_label || "").toLowerCase() === "medium"
      ? "warning"
      : "good"
    : "default";

  const tooltipText = {
    assignedBooth: "Current booth assignment for this exhibitor in the linked event.",
    aiConfidence: "Model confidence level for the current exhibitor analytics and heatmap output.",
    competitionDensity: "How busy the surrounding competitive area is around the booth catchment.",
    eventsLinked: "Number of event records currently linked to this exhibitor.",
    overview: "High-level summary of exhibitor performance, traffic and engagement insights.",
    profile: "Core exhibitor details and average engagement summary.",
  };

  return (
    <div className="exhPageWrap">
      <div className="exhTopRow">
        <KpiCard
          title="Assigned Booth"
          tooltip={tooltipText.assignedBooth}
          value={boothText}
          valueClassName="isBoothCode"
          sub={
            heatmap?.meta?.hallName
              ? `${heatmap.meta.hallName} · ${profile?.exhibitor_name || heatmap?.meta?.exhibitorId || exhibitorId}`
              : profile?.exhibitor_name || exhibitorId
          }
          icon={<BoothIcon />}
        />

        <KpiCard
          title="AI Confidence"
          tooltip={tooltipText.aiConfidence}
          value={confidencePct === null ? "—" : formatPercent(confidencePct, 0)}
          sub={
            heatmap?.meta?.aiConfidence?.avgStd !== undefined
              ? `Avg uncertainty ${formatMetric(heatmap.meta.aiConfidence.avgStd, 4)}`
              : "Model uncertainty overview"
          }
          icon={<ConfidenceIcon />}
          tone={confidenceTone}
        />

        <KpiCard
          title="Competition Density"
          tooltip={tooltipText.competitionDensity}
          value={densityLatest?.competitive_density_label || "—"}
          sub={densityLatest ? `Score ${formatMetric(densityLatest.competitive_density_score, 3)}` : "Latest catchment comparison"}
          icon={<DensityIcon />}
          tone={densityTone}
        />

        <KpiCard
          title="Events Linked"
          tooltip={tooltipText.eventsLinked}
          value={String(events.length || 0)}
          sub={events.length ? `Latest ${events[0]?.event_name || events[0]?.event_id}` : "No linked event records"}
          icon={<EventsIcon />}
        />
      </div>

      <div className="exhBottomGrid">
        <section className="exhCard">
          <div className="exhCardHeaderRow">
            <div className="exhCardHeaderLeft">
              <div>
                <h3>
                  Overview
                  <InfoTooltip text={tooltipText.overview} color="#64748b" />
                </h3>
                <p>High-level exhibitor performance snapshot.</p>
              </div>
            </div>
          </div>
          <div className="exhCardBody">
            <div className="exhInsightList">
              {quickInsights.length ? (
                quickInsights.map((item) => (
                  <div key={item} className="exhInsightItem">
                    <span className="exhInsightBullet" />
                    <p>{item}</p>
                  </div>
                ))
              ) : (
                <div className="exhEmptyInline">Insights will populate once the exhibitor endpoints return data.</div>
              )}
            </div>
          </div>
        </section>

        <section className="exhCard">
          <div className="exhCardHeaderRow">
            <div className="exhCardHeaderLeft">
              <div>
                <h3>
                  Profile
                  <InfoTooltip text={tooltipText.profile} color="#64748b" />
                </h3>
                <p>Current exhibitor summary.</p>
              </div>
            </div>
          </div>
          <div className="exhCardBody">
            <div className="exhContactList">
              <div>
                <label>Exhibitor</label>
                <strong>{profile?.exhibitor_name || "—"}</strong>
              </div>
              <div>
                <label>Industry</label>
                <strong>{profile?.industry || "—"}</strong>
              </div>
              <div>
                <label>Country</label>
                <strong>{profile?.hq_country || "—"}</strong>
              </div>
              <div>
                <label>Average engagement</label>
                <strong>{avgCatchmentEngagement !== null ? formatMetric(avgCatchmentEngagement, 3) : "—"}</strong>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}