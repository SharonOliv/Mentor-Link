import { api } from "../../api/client";
import { User, UserRole } from "../../types";

export interface AdminUser extends User {
  _id: string;
  department?: string;
  status: "active" | "disabled";
  createdAt: string;
}

export const fetchUsers = async (filters?: { role?: string; department?: string }): Promise<AdminUser[]> => {
  const { data } = await api.get<{ data: { users: AdminUser[] } }>("/admin/users", {
    params: filters,
  });
  return data.data.users;
};

interface CreateUserInput {
  email: string;
  name: string;
  role: UserRole;
  department?: string;
  subjects?: string[];
}

interface CreateUserResult {
  email: string;
  name: string;
  role: string;
  tempPassword: string;
}

export const createUser = async (input: CreateUserInput): Promise<CreateUserResult> => {
  const { data } = await api.post<{ data: CreateUserResult }>("/admin/users", input);
  return data.data;
};

interface BulkImportResult {
  created: CreateUserResult[];
  skipped: { row: number; email: string; reason: string }[];
}

export const bulkImportUsers = async (file: File): Promise<BulkImportResult> => {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<{ data: BulkImportResult }>(
    "/admin/users/bulk-import",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data.data;
};

export const setUserStatus = async (id: string, status: "active" | "disabled"): Promise<void> => {
  await api.patch(`/admin/users/${id}/status`, { status });
};

export const deleteUser = async (id: string): Promise<void> => {
  await api.delete(`/admin/users/${id}`);
};
