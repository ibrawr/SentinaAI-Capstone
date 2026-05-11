const REPORT_EXPORT_SERVICE_URL =
  process.env.REPORT_EXPORT_SERVICE_URL || "http://127.0.0.1:8010";

async function renderReport(payload) {
  const response = await fetch(`${REPORT_EXPORT_SERVICE_URL}/api/render-report`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Report export service failed (${response.status}): ${text}`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}

module.exports = {
  REPORT_EXPORT_SERVICE_URL,
  renderReport,
};
