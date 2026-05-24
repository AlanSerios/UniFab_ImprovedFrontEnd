import { Link } from "react-router-dom";
import { PageShell, Panel } from "../components/ui/Page";

export default function NotFound() {
  return (
    <PageShell size="sm">
      <Panel className="unifab-support unifab-not-found">
        <div className="unifab-support__card rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="unifab-support__eyebrow text-sm font-medium text-slate-500">
            404
          </p>
          <h1 className="mt-1 text-3xl font-bold">Page not found</h1>
          <p className="mt-3 text-slate-600">
            The page you are looking for does not exist or may have moved.
          </p>

          <div className="mt-6 flex justify-center gap-3">
            <Link
              to="/"
              className="unifab-support__primary rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Go Home
            </Link>

            <Link
              to="/quote"
              className="unifab-support__secondary rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-100"
            >
              Get Quote
            </Link>
          </div>
        </div>
      </Panel>
    </PageShell>
  );
}
