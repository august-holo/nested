// The documents API, as the server defines it in api/src/modules/documents.rs.

export interface Summary {
  id: string;
  title: string;
  updated_at: number;
}

export interface Document extends Summary {
  body: string;
  created_at: number;
}

export interface Draft {
  title: string;
  body: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function documentsApi(token: string | null) {
  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (init.body) headers.set("Content-Type", "application/json");
    const res = await fetch(`/api${path}`, { ...init, headers });
    if (!res.ok) throw new ApiError(res.status, `${init.method ?? "GET"} ${path}: ${res.status}`);
    return res.status === 204 ? (undefined as T) : res.json();
  }

  return {
    list: () => call<Summary[]>("/documents"),
    create: (draft: Draft) =>
      call<Document>("/documents", { method: "POST", body: JSON.stringify(draft) }),
    read: (id: string) => call<Document>(`/documents/${id}`),
    update: (id: string, draft: Draft) =>
      call<Summary>(`/documents/${id}`, { method: "PUT", body: JSON.stringify(draft) }),
    remove: (id: string) => call<void>(`/documents/${id}`, { method: "DELETE" }),
  };
}
