import axios from "axios";

// Standard response wrapper used in the backend
export interface ResponseBase<T> {
  code: number;
  msg: string;
  data: T;
}

export interface APIKeyRead {
  id: string;
  user_id: string;
  key: string;
  name: string | null;
  is_active: boolean;
  created_at: string;
}

export interface APIKeyCreateRequest {
  user_id?: string;
  name?: string;
  key?: string;
}

export interface APIKeyUpdate {
  name?: string;
  is_active?: boolean;
}

const getBaseUrl = () => {
    if (typeof window !== "undefined") {
        return window.location.origin;
    }
    return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
};

const api = axios.create({
  baseURL: getBaseUrl(),
  withCredentials: true, // For JWT cookies
});

// Since the openapi-client is outdated, we use direct axios calls for API Keys
export const apiKeyService = {
  listApiKeys: async (userId?: string): Promise<ResponseBase<APIKeyRead[]>> => {
    const params = userId ? { user_id: userId } : {};
    const res = await api.get<ResponseBase<APIKeyRead[]>>("/api/api-keys", { params });
    return res.data;
  },

  createApiKey: async (body: APIKeyCreateRequest): Promise<ResponseBase<APIKeyRead>> => {
    const res = await api.post<ResponseBase<APIKeyRead>>("/api/api-keys", body);
    return res.data;
  },

  updateApiKey: async (id: string, body: APIKeyUpdate): Promise<ResponseBase<APIKeyRead>> => {
    const res = await api.patch<ResponseBase<APIKeyRead>>(`/api/api-keys/${id}`, body);
    return res.data;
  },

  deleteApiKey: async (id: string): Promise<ResponseBase<{ deleted: boolean }>> => {
    const res = await api.delete<ResponseBase<{ deleted: boolean }>>(`/api/api-keys/${id}`);
    return res.data;
  },
};
