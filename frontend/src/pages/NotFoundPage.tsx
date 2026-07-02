import { Link } from "react-router-dom";

export const NotFoundPage = () => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper text-center">
    <p className="font-display text-3xl font-semibold text-ink-900">Page not found</p>
    <p className="text-sm text-ink-500">The page you're looking for doesn't exist.</p>
    <Link to="/" className="mt-2 text-sm font-medium text-brass-dark hover:underline">
      Go home
    </Link>
  </div>
);
