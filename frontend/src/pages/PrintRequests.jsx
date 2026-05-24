import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMyPrintRequests } from "../api/requests";
import { ButtonLink } from "../components/ui/Button";
import { Alert, EmptyState } from "../components/ui/Feedback";
import { PageHeader, PageShell, Panel } from "../components/ui/Page";
import {
  DataTable,
  TableBody,
  TableHead,
  TableWrap,
} from "../components/ui/Table";
import {
  extractPrintRequests,
  formatRequestCost,
  getRequestFileName,
  getRequestItemCount,
  getRequestMaterialLabel,
  getRequestReference,
} from "../utils/print-requests";

export default function PrintRequests() {
  const [printRequests, setPrintRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadPrintRequests() {
      try {
        setIsLoading(true);
        setError("");

        const data = await getMyPrintRequests();
        setPrintRequests(extractPrintRequests(data));
      } catch (err) {
        setError(err.message);
        setPrintRequests([]);
      } finally {
        setIsLoading(false);
      }
    }

    loadPrintRequests();
  }, []);

  return (
    <PageShell size="lg">
      <Panel className="unifab-client unifab-client__panel unifab-client__requests unifab-client-list">
        <PageHeader
          title="My print requests"
          description="Track submitted print requests and review their current status."
          action={<ButtonLink to="/quote">New quote</ButtonLink>}
        />

        {isLoading && (
          <p className="mt-6 text-slate-600">Loading print requests...</p>
        )}

        <Alert className="mt-6" type="error">
          {error}
        </Alert>

        {!isLoading && !error && printRequests.length === 0 && (
          <EmptyState
            className="mt-6"
            title="No print requests yet."
            description="Start by calculating a quote for a model."
            action={<ButtonLink to="/quote">Start a quote</ButtonLink>}
          />
        )}

        {printRequests.length > 0 && (
          <div className="unifab-client__table unifab-client-list__table mt-6">
            <TableWrap>
              <DataTable>
                <TableHead>
                <tr>
                  <th className="px-4 py-3 font-medium">Reference</th>
                  <th className="px-4 py-3 font-medium">File</th>
                  <th className="px-4 py-3 font-medium">Items</th>
                  <th className="px-4 py-3 font-medium">Material</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Cost</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
                </TableHead>

                <TableBody>
                {printRequests.map((request) => (
                  <tr key={request.id}>
                    <td className="px-4 py-3 font-medium text-slate-950">
                      {getRequestReference(request)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {getRequestFileName(request)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {getRequestItemCount(request)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {getRequestMaterialLabel(request)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className="unifab-client__status-badge">
                        {request.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums">
                      {formatRequestCost(request)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/requests/${request.id}`}
                        className="unifab-client__text-link font-semibold text-slate-950 underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
                </TableBody>
              </DataTable>
            </TableWrap>
          </div>
        )}
      </Panel>
    </PageShell>
  );
}
