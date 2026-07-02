import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { User } from "../types";
import { setAccessToken } from "../api/client";
import { loginRequest, logoutRequest, getMeRequest } from "../api/auth";
import axios from "axios";

interface AuthContextValue {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL as string;

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On first load (and on every full page refresh), there's no access
  // token in memory yet — but the httpOnly refresh cookie may still be
  // valid from a previous session. Try a silent refresh before deciding
  // the user is logged out, so a page reload doesn't force a re-login
  // every single time.
  useEffect(() => {
    const attemptSilentRefresh = async () => {
      try {
        const { data } = await axios.post<{ data: { accessToken: string } }>(
          `${BACKEND_URL}/api/v1/auth/refresh`,
          {},
          { withCredentials: true }
        );
        const newToken = data.data.accessToken;
        setAccessToken(newToken);
        setToken(newToken);
        const me = await getMeRequest();
        setUser(me);
      } catch {
        setAccessToken(null);
        setToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    };

    attemptSilentRefresh();
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    const { data } = await loginRequest(email, password);
    setAccessToken(data.accessToken);
    setToken(data.accessToken);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await logoutRequest();
    } finally {
      setAccessToken(null);
      setToken(null);
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken: token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
};
