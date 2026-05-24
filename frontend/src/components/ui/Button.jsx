import { Link } from "react-router-dom";

const variants = {
  primary:
    "bg-[#2b67ad] text-white shadow-sm hover:bg-[#1f4f86] focus-visible:ring-[#2b67ad] disabled:bg-slate-400",
  secondary:
    "border border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-slate-500 disabled:text-slate-400",
  subtle:
    "bg-slate-100 text-slate-800 hover:bg-slate-200 focus-visible:ring-slate-500 disabled:text-slate-400",
  danger:
    "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600 disabled:bg-red-300",
};

const sizes = {
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-2 text-sm",
};

const baseClass =
  "inline-flex items-center justify-center rounded-md font-semibold transition duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70";

export function Button({
  children,
  className = "",
  size = "md",
  variant = "primary",
  ...props
}) {
  return (
    <button
      className={`${baseClass} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  children,
  className = "",
  size = "md",
  variant = "primary",
  ...props
}) {
  return (
    <Link
      className={`${baseClass} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </Link>
  );
}
