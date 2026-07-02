export const StatCard = ({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: string;
  sublabel?: string;
}) => (
  <div className="rounded-lg border border-ink-100 bg-white p-4">
    <p className="text-xs uppercase tracking-wide text-ink-300">{label}</p>
    <p className="mt-1 font-display text-2xl font-semibold text-ink-900">{value}</p>
    {sublabel && <p className="mt-0.5 text-xs text-ink-300">{sublabel}</p>}
  </div>
);
