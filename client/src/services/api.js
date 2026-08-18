const API_BASE = "http://127.0.0.1:3001/api";

function getToken() {
  return localStorage.getItem("token");
}

export async function apiRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${res.status})`);
  }
  if (res.headers.get("content-type")?.includes("spreadsheetml")) {
    return res.blob();
  }
  return res.json();
}

export async function downloadReport(type, query = "") {
  const token = getToken();
  const res = await fetch(`${API_BASE}/reports/${type}${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Report download failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${type}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
