import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string;

/**
 * The access token lives in memory only, never localStorage. The backend
 * issues a 15-minute access token specifically so a leaked one is short
 * lived — storing it in localStorage would partially defeat that, since
 * localStorage is readable by any script on the page (XSS). The refresh
 * token is in an httpOnly cookie the browser handles automatically; this
 * module never sees it directly.
 */
let accessToken: string | null = null;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};

export const getAccessToken = (): string | null => accessToken;

export const api = axios.create({
  baseURL: `${BACKEND_URL}/api/v1`,
  withCredentials: true, // sends the httpOnly refresh cookie automatically
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Queues concurrent requests that 401'd while a single refresh call is in
// flight, instead of firing N parallel refresh calls if N requests happen
// to fail at once (e.g. a page that fires several queries on load).
let refreshPromise: Promise<string | null> | null = null;

const performRefresh = async (): Promise<string | null> => {
  try {
    const { data } = await axios.post<{ data: { accessToken: string } }>(
      `${BACKEND_URL}/api/v1/auth/refresh`,
      {},
      { withCredentials: true }
    );
    const newToken = data.data.accessToken;
    setAccessToken(newToken);
    return newToken;
  } catch {
    setAccessToken(null);
    return null;
  }
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;

    const isAuthEndpoint =
      original?.url?.includes("/auth/login") || original?.url?.includes("/auth/refresh");

    if (error.response?.status === 401 && original && !original._retried && !isAuthEndpoint) {
      original._retried = true;

      if (!refreshPromise) {
        refreshPromise = performRefresh().finally(() => {
          refreshPromise = null;
        });
      }

      const newToken = await refreshPromise;
      if (newToken) {
        original.headers = original.headers ?? {};
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
    }

    return Promise.reject(error);
  }
);

export const getApiErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error) && error.response?.data) {
    const data = error.response.data as { message?: string };
    if (data.message) return data.message;
  }
  return "Something went wrong. Please try again.";
};
