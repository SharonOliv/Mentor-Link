import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import * as adminApi from "./api";
import { getApiErrorMessage } from "../../api/client";

const USERS_KEY = ["admin", "users"];

export const useUsers = (filters?: { role?: string; department?: string }) => {
  return useQuery({
    queryKey: [...USERS_KEY, filters ?? {}],
    queryFn: () => adminApi.fetchUsers(filters),
  });
};

export const useCreateUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.createUser,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      toast.success(`${result.name} created — temp password sent by email`);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
};

export const useBulkImport = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.bulkImportUsers,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      toast.success(`${result.created.length} created, ${result.skipped.length} skipped`);
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
};

export const useSetUserStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "disabled" }) =>
      adminApi.setUserStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      toast.success("Status updated");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
};

export const useDeleteUser = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: USERS_KEY });
      toast.success("User deleted");
    },
    onError: (error) => toast.error(getApiErrorMessage(error)),
  });
};
