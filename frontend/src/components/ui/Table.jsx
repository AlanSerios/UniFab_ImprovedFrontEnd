export function TableWrap({ children }) {
  return (
    <div className="unifab-table-wrap overflow-hidden rounded-lg border border-slate-200">
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

export function DataTable({ children }) {
  return <table className="unifab-data-table w-full text-left text-sm">{children}</table>;
}

export function TableHead({ children }) {
  return <thead className="unifab-table-head bg-slate-100 text-slate-600">{children}</thead>;
}

export function TableBody({ children }) {
  return <tbody className="unifab-table-body divide-y divide-slate-200">{children}</tbody>;
}
