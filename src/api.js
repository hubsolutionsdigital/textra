export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(method, url, body) {
  const init = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  return data;
}

/** URL builders that differ between the agency (signed in) and client (share link) views. */
export function fileUrls({ projectId, token }) {
  const base = token ? `/api/share/${token}` : `/api/projects/${projectId}`;
  return {
    version: (id) => `${base}/versions/${id}/file`,
    attachment: (id) => `${base}/attachments/${id}`,
  };
}
