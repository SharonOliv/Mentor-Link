import { FormEvent, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { getApiErrorMessage } from "../../api/client";
import { Button } from "../../components/Button";
import { User } from "../../types";

const dashboardPathForRole = (role: User["role"]): string => {
  switch (role) {
    case "admin":
      return "/admin/dashboard";
    case "mentor":
      return "/mentor/dashboard";
    case "student":
      return "/student/dashboard";
  }
};

/**
 * The single login page. There is deliberately no role selector here — the
 * account's role comes back from the backend after authentication, and
 * this page routes based on that response. The original app had three
 * separate login forms (Student/Teacher/Admin) that called the exact same
 * backend logic; this replaces all three with one form and one redirect
 * decision made from real data, not from which page the visitor happened
 * to land on.
 */
export const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const user = await login(email, password);
      toast.success(`Welcome back, ${user.name.split(" ")[0]}`);

      if (user.mustChangePassword) {
        navigate("/change-password", { replace: true });
        return;
      }

      const from = (location.state as { from?: Location })?.from?.pathname;
      navigate(from || dashboardPathForRole(user.role), { replace: true });
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
          <p className="font-display text-2xl font-semibold text-ink-900">
            Faculty Appointments
          </p>
          <p className="mt-2 text-sm text-ink-500">Sign in with your university email</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-ink-100 bg-white p-6 shadow-sm"
        >
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-700">Email</span>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded border border-ink-100 px-3 py-2 text-sm focus:border-brass focus:outline-none"
                placeholder="you@university.edu"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-700">Password</span>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="rounded border border-ink-100 px-3 py-2 text-sm focus:border-brass focus:outline-none"
                placeholder="••••••••"
              />
            </label>

            <Button type="submit" disabled={isSubmitting} className="mt-2 w-full">
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        </form>

        <p className="mt-6 text-center text-xs text-ink-300">
          Accounts are created by your administrator. Contact them if you don't have one.
        </p>
      </div>
    </div>
  );
};
