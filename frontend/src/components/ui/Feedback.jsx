const alertStyles = {
  error: "border-red-200 bg-red-50 text-red-700",
  success: "border-green-200 bg-green-50 text-green-700",
  info: "border-slate-200 bg-slate-50 text-slate-700",
};

const badgeStyles = {
  neutral: "bg-slate-100 text-slate-700",
  success: "bg-green-100 text-green-700",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-red-100 text-red-700",
};

export function Alert({ children, type = "info", className = "" }) {
  if (!children) {
    return null;
  }

  return (
    <div
      className={`unifab-alert rounded-md border px-4 py-3 text-sm ${alertStyles[type]} ${className}`}
    >
      {children}
    </div>
  );
}

export function EmptyState({ title, description, action, className = "" }) {
  return (
    <div
      className={`unifab-empty-state rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center ${className}`}
    >
      <p className="font-medium text-slate-950">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatusBadge({ children, tone = "neutral" }) {
  return (
    <span
      className={`unifab-status-badge inline-flex rounded-full px-2 py-1 text-xs font-medium ${badgeStyles[tone]}`}
    >
      {children}
    </span>
  );
}
