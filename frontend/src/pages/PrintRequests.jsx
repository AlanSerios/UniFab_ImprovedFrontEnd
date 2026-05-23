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

function getRequestCurrency(request) {
  return (
    request?.quoteSnapshot?.pricingConfigSnapshot?.currency ||
    request?.quoteSnapshot?.quote?.currency ||
    "PHP"
  );
}

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
        setPrintRequests(data.data?.printRequests || data.printRequests || []);
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
      <Panel>
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
          <div className="mt-6">
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
                      {request.referenceNumber || `#${request.id}`}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {request.fileOriginalName || "Model file"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {request.itemCount || 1}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {[request.material, request.materialColorName]
                        .filter(Boolean)
                        .join(" / ")}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {request.status}
                    </td>
                    <td className="px-4 py-3 text-slate-600 tabular-nums">
                      {getRequestCurrency(request)}{" "}
                      {Number(request.estimatedCost || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/requests/${request.id}`}
                        className="font-semibold text-slate-950 underline"
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
