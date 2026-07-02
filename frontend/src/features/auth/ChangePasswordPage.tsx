import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { changePasswordRequest } from "../../api/auth";
import { getApiErrorMessage } from "../../api/client";
import { useAuth } from "../../context/AuthContext";
import { Button } from "../../components/Button";

const dashboardPathForRole = (role: string): string => {
  if (role === "admin") return "/admin/dashboard";
  if (role === "mentor") return "/mentor/dashboard";
  return "/student/dashboard";
};

export const ChangePasswordPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords don't match");
      return;
    }
    setIsSubmitting(true);
    try {
      await changePasswordRequest(currentPassword, newPassword);
      toast.success("Password updated");
      navigate(dashboardPathForRole(user?.role ?? "student"), { replace: true });
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-semibold text-ink-900">Set a new password</p>
          <p className="mt-2 text-sm text-ink-500">
            Your administrator created this account with a temporary password. Choose a new one
            to continue.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-ink-100 bg-white p-6 shadow-sm"
        >
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-700">Temporary password</span>
              <input
                type="password"
                required
                autoFocus
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="rounded border border-ink-100 px-3 py-2 text-sm focus:border-brass focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-700">New password</span>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded border border-ink-100 px-3 py-2 text-sm focus:border-brass focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-700">Confirm new password</span>
              <input
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="rounded border border-ink-100 px-3 py-2 text-sm focus:border-brass focus:outline-none"
              />
            </label>
            <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
              {isSubmitting ? "Updating…" : "Update password"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
