import { api } from "./client";
import { User } from "../types";

interface LoginResponse {
  status: string;
  data: {
    user: User;
    accessToken: string;
  };
}

export const loginRequest = async (email: string, password: string): Promise<LoginResponse> => {
  const { data } = await api.post<LoginResponse>("/auth/login", { email, password });
  return data;
};

export const logoutRequest = async (): Promise<void> => {
  await api.post("/auth/logout");
};

export const getMeRequest = async (): Promise<User> => {
  const { data } = await api.get<{ data: { user: User } }>("/auth/me");
  return data.data.user;
};

export const changePasswordRequest = async (
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  await api.patch("/auth/change-password", { currentPassword, newPassword });
};
