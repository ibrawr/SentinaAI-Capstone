import axios from "axios";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8080";

function buildUrl(path) {
  return `${API_BASE}${path}`;
}

function extractFilename(contentDisposition, fallback) {
  const value = String(contentDisposition || "");
  const match = value.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const name = match?.[1] || match?.[2];
  return name ? decodeURIComponent(name) : fallback;
}

export async function fetchReports(domain) {
  const response = await axios.get(buildUrl("/reports"), {
    params: { domain },
  });
  return response.data?.data || [];
}

export async function fetchReport(reportId) {
  const response = await axios.get(buildUrl(`/reports/${reportId}`));
  return response.data?.data;
}

export async function fetchReportOptions(domain, params = {}) {
  const response = await axios.get(buildUrl("/reports/options"), {
    params: { domain, ...params },
  });
  return response.data?.data || {};
}

export async function createReportDraft(domain, payload) {
  const response = await axios.post(buildUrl("/reports/draft"), {
    domain,
    ...payload,
  });
  return response.data?.data;
}

export async function updateReportDraft(reportId, domain, payload) {
  const response = await axios.put(buildUrl(`/reports/${reportId}/draft`), {
    domain,
    ...payload,
  });
  return response.data?.data;
}

export async function generateReport(domain, payload) {
  const response = await axios.post(buildUrl("/reports/generate"), {
    domain,
    ...payload,
  });
  return response.data?.data;
}

export async function finalizeDraftReport(reportId) {
  const response = await axios.post(buildUrl(`/reports/${reportId}/generate`));
  return response.data?.data;
}

export async function deleteReport(reportId) {
  const response = await axios.delete(buildUrl(`/reports/${reportId}`));
  return response.data;
}

export async function downloadReportFile(reportId) {
  const response = await axios.get(buildUrl(`/reports/${reportId}/download`), {
    responseType: "blob",
  });
  const fileName = extractFilename(response.headers["content-disposition"], `report-${reportId}`);
  const blobUrl = window.URL.createObjectURL(response.data);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export async function openReportFile(reportId) {
  const response = await axios.get(buildUrl(`/reports/${reportId}/view`), {
    responseType: "blob",
  });
  const blobUrl = window.URL.createObjectURL(response.data);
  window.open(blobUrl, "_blank", "noopener,noreferrer");
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60_000);
}
