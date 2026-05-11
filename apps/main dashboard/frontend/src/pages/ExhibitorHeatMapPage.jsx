/**
 * Displays the exhibitor heat map page using shared exhibitor outlet context,
 * including hall heat snapshots, time-bucket heat map tables, and the current
 * engagement legend. This page reads shared heat map data, hall summaries,
 * heat color scaling, and metric formatting helpers from Outlet context.
 */

import { useOutletContext } from "react-router-dom";

export default function ExhibitorHeatMapPage() {
  const {
    heatmap,
    latestHallSnapshot,
    heatStats,
    heatColor,
    formatMetric,
  } = useOutletContext();

  const latestHeatRow = Array.isArray(heatmap?.matrix) && heatmap.matrix.length
    ? heatmap.matrix[heatmap.matrix.length - 1]
    : [];

  return (
    <div className="exhPageWrap">
      <section className="exhCard">
        <div className="exhCardHeaderRow">
          <div className="exhCardHeaderLeft">
            <div>
              <h3>Engagement heat map</h3>
              <p>Catchment halls around the assigned booth, grouped by time bucket.</p>
            </div>
          </div>
          <div className="exhCardHeaderRight">
            <span className="exhHint">
              {heatmap?.meta?.intervalMinutes ? `${heatmap.meta.intervalMinutes} min buckets` : "Live"}
            </span>
          </div>
        </div>

        <div className="exhCardBody">
          {!heatmap ? (
            <div className="exhEmptyState">Heat map data will appear here once the exhibitor analytics service responds.</div>
          ) : (
            <>
              <div className="exhHallSnapshot">
                {latestHallSnapshot.length ? (
                  latestHallSnapshot.map((item) => {
                    const { minV, range } = heatStats || { minV: 0, range: 1 };
                    const norm = Math.max(0, Math.min(1, (item.value - minV) / range));
                    return (
                      <div
                        key={item.hall}
                        className="exhHallTile"
                        style={{
                          background: heatColor(norm),
                          color: norm > 0.55 ? "#fff" : "#140625",
                        }}
                      >
                        <span>{item.hall}</span>
                        <strong>{formatMetric(item.value, 3)}</strong>
                      </div>
                    );
                  })
                ) : (
                  <div className="exhEmptyInline">No halls match the current search.</div>
                )}
              </div>

              <div className="exhHeatmapTableWrap">
                <table className="exhHeatmapTable">
                  <thead>
                    <tr>
                      <th>Time</th>
                      {(heatmap?.xLabels || []).map((label) => (
                        <th key={label}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(heatmap?.yLabels || []).map((bucket, rowIdx) => (
                      <tr key={`${bucket}-${rowIdx}`}>
                        <td className="exhStickyCell">{bucket}</td>
                        {(heatmap?.matrix?.[rowIdx] || []).map((value, colIdx) => {
                          const num = Number(value);
                          const { minV, range } = heatStats || { minV: 0, range: 1 };
                          const norm = Math.max(0, Math.min(1, (num - minV) / range));

                          return (
                            <td
                              key={`${bucket}-${colIdx}`}
                              title={`${heatmap?.xLabels?.[colIdx]} · ${formatMetric(num, 4)}`}
                              style={{
                                background: heatColor(norm),
                                color: norm > 0.55 ? "#fff" : "#140625",
                              }}
                            >
                              {formatMetric(num, 3)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {heatStats ? (
                <div className="exhLegendRow">
                  <span>Low</span>
                  <div className="exhLegendBar" />
                  <span>High</span>
                  <small>
                    Min {formatMetric(heatStats.minV, 4)} · Max {formatMetric(heatStats.maxV, 4)}
                  </small>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </div>
  );
}