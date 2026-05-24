export function Field({ label, hint, children }) {
  return (
    <div className="unifab-field">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs leading-5 text-slate-500">{hint}</p>}
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 transition placeholder:text-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

export function TextInput({ className = "", ...props }) {
  return <input className={`unifab-input ${inputClass} ${className}`} {...props} />;
}

export function TextArea({ className = "", ...props }) {
  return <textarea className={`unifab-input ${inputClass} ${className}`} {...props} />;
}

export function SelectInput({ className = "", children, ...props }) {
  return (
    <select className={`unifab-input ${inputClass} ${className}`} {...props}>
      {children}
    </select>
  );
}

export function FormSection({ children, columns = "md:grid-cols-2" }) {
  return (
    <div
      className={`unifab-form-section grid gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4 ${columns}`}
    >
      {children}
    </div>
  );
}
