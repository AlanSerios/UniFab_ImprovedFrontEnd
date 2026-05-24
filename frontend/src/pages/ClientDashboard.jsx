import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bookmark,
  Box,
  ClipboardList,
  FolderOpen,
  PackageCheck,
  ReceiptText,
  ShoppingCart,
  Sparkles,
} from "lucide-react";

import { getSavedDesigns } from "../api/designs";
import { getMyPrintRequests } from "../api/requests";
import { ButtonLink } from "../components/ui/Button";
import { Alert, StatusBadge } from "../components/ui/Feedback";
import { PageShell } from "../components/ui/Page";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import { formatMoney } from "../utils/display-format";
import {
  extractPrintRequests,
  formatRequestCost,
  getRequestFileName,
  getRequestItemCount,
  getRequestReference,
} from "../utils/print-requests";

const ACTIVE_REQUEST_STATUSES = new Set([
  "submitted",
  "awaiting_payment",
  "payment_verified",
  "printing",
]);

function extractSavedDesignList(data) {
  const payload = data?.data || data || {};
  return payload.savedDesigns || [];
}

function normalizeStatus(status = "") {
  return String(status || "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatDate(value) {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getRequestDate(request) {
  return (
    request.submittedAt ||
    request.createdAt ||
    request.updatedAt ||
    request.statusUpdatedAt ||
    ""
  );
}

function getStatusTone(status) {
  if (status === "completed") return "success";
  if (status === "cancelled" || status === "rejected") return "danger";
  if (status === "awaiting_payment" || status === "submitted") return "warning";
  return "neutral";
}

export default function ClientDashboard() {
  const { user } = useAuth();
  const {
    cartError,
    currency,
    isCartLoading,
    itemCount,
    items: cartItems,
    subtotal,
  } = useCart();

  const displayName =
    user?.firstName || user?.name || user?.email?.split("@")[0] || "Client";

  const [printRequests, setPrintRequests] = useState([]);
  const [savedDesigns, setSavedDesigns] = useState([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(true);
  const [isLoadingSaved, setIsLoadingSaved] = useState(true);
  const [requestError, setRequestError] = useState("");
  const [savedError, setSavedError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      try {
        setIsLoadingRequests(true);
        setRequestError("");
        const data = await getMyPrintRequests();

        if (isMounted) {
          setPrintRequests(extractPrintRequests(data));
        }
      } catch (err) {
        if (isMounted) {
          setRequestError(err.message || "Unable to load print requests.");
          setPrintRequests([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingRequests(false);
        }
      }
    }

    loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadSavedDesigns() {
      try {
        setIsLoadingSaved(true);
        setSavedError("");
        const data = await getSavedDesigns();

        if (isMounted) {
          setSavedDesigns(extractSavedDesignList(data));
        }
      } catch (err) {
        if (isMounted) {
          setSavedError(err.message || "Unable to load saved designs.");
          setSavedDesigns([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingSaved(false);
        }
      }
    }

    loadSavedDesigns();

    return () => {
      isMounted = false;
    };
  }, []);

  const requestStats = useMemo(() => {
    const active = printRequests.filter((request) =>
      ACTIVE_REQUEST_STATUSES.has(request.status),
    ).length;
    const awaitingPayment = printRequests.filter(
      (request) => request.status === "awaiting_payment",
    ).length;
    const completed = printRequests.filter(
      (request) => request.status === "completed",
    ).length;

    return { active, awaitingPayment, completed };
  }, [printRequests]);

  const recentRequests = useMemo(
    () =>
      [...printRequests]
        .sort((a, b) => {
          const aTime = new Date(getRequestDate(a)).getTime() || 0;
          const bTime = new Date(getRequestDate(b)).getTime() || 0;
          return bTime - aTime;
        })
        .slice(0, 4),
    [printRequests],
  );

  const recentCartItems = cartItems.slice(0, 3);
  const recentSavedDesigns = savedDesigns.slice(0, 3);

  const activityItems = useMemo(() => {
    const requestActivity = recentRequests.slice(0, 2).map((request) => ({
      key: `request-${request.id}`,
      title: `${getRequestReference(request)} is ${normalizeStatus(request.status)}`,
      meta: formatDate(getRequestDate(request)) || "Recently updated",
      to: `/requests/${request.id}`,
    }));

    const cartActivity =
      itemCount > 0
        ? [
            {
              key: "cart",
              title: `${itemCount} quoted item${itemCount === 1 ? "" : "s"} in cart`,
              meta: formatMoney(subtotal, currency || "PHP"),
              to: "/cart",
            },
          ]
        : [];

    const savedActivity =
      savedDesigns.length > 0
        ? [
            {
              key: "saved",
              title: `${savedDesigns.length} saved design${
                savedDesigns.length === 1 ? "" : "s"
              }`,
              meta: "Private bookmarks",
              to: "/saved-designs",
            },
          ]
        : [];

    return [...requestActivity, ...cartActivity, ...savedActivity].slice(0, 4);
  }, [currency, itemCount, recentRequests, savedDesigns.length, subtotal]);

  return (
    <PageShell size="xl">
      <div className="unifab-client unifab-dashboard">
        <section className="unifab-dashboard__hero">
          <div>
            <p className="unifab-dashboard__eyebrow">Client workspace</p>
            <h1>Welcome, {displayName}</h1>
            <p>
              A focused view of your print requests, quote cart, saved designs,
              and the next actions that keep work moving through FabLab review.
            </p>
            <div className="unifab-dashboard__hero-actions">
              <ButtonLink to="/quote">Create Print Request</ButtonLink>
              <ButtonLink to="/designs" variant="secondary">
                Browse Designs
              </ButtonLink>
            </div>
          </div>

          <div className="unifab-dashboard__command-card">
            <span>Next best action</span>
            <strong>
              {itemCount > 0
                ? "Review your cart"
                : requestStats.awaitingPayment > 0
                  ? "Check payment steps"
                  : "Start a slicer quote"}
            </strong>
            <p>
              {itemCount > 0
                ? "Convert quoted items into a request draft when you are ready."
                : requestStats.awaitingPayment > 0
                  ? "Open requests that are waiting for payment instructions."
                  : "Upload a model or choose a Print Ready design to begin."}
            </p>
            <ButtonLink
              to={itemCount > 0 ? "/cart" : "/quote"}
              className="w-full"
            >
              {itemCount > 0 ? "View Cart" : "Start Quote"}
            </ButtonLink>
          </div>
        </section>

        {(requestError || savedError || cartError) && (
          <div className="unifab-dashboard__alerts">
            <Alert type="error">{requestError}</Alert>
            <Alert type="error">{savedError}</Alert>
            <Alert type="error">{cartError}</Alert>
          </div>
        )}

        <section className="unifab-dashboard__stats" aria-label="Dashboard summary">
          <StatCard
            icon={<ClipboardList className="h-5 w-5" aria-hidden="true" />}
            label="Active requests"
            value={requestStats.active}
            detail={`${requestStats.awaitingPayment} awaiting payment`}
          />
          <StatCard
            icon={<ShoppingCart className="h-5 w-5" aria-hidden="true" />}
            label="Quote cart"
            value={itemCount}
            detail={
              isCartLoading ? "Loading cart" : formatMoney(subtotal, currency)
            }
          />
          <StatCard
            icon={<PackageCheck className="h-5 w-5" aria-hidden="true" />}
            label="Completed"
            value={requestStats.completed}
            detail="Finished print requests"
          />
          <StatCard
            icon={<Bookmark className="h-5 w-5" aria-hidden="true" />}
            label="Saved designs"
            value={savedDesigns.length}
            detail={isLoadingSaved ? "Loading bookmarks" : "Private shortlist"}
          />
        </section>

        <div className="unifab-dashboard__workspace">
          <main className="unifab-dashboard__main">
            <DashboardPanel
              title="Recent print requests"
              description="Track active jobs, payment state, and completion."
              action={<Link to="/requests">View all</Link>}
            >
              {isLoadingRequests ? (
                <DashboardEmpty title="Loading requests..." />
              ) : recentRequests.length === 0 ? (
                <DashboardEmpty
                  title="No print requests yet"
                  description="Create a quote first, then submit it as a verified request."
                  action={<ButtonLink to="/quote">Start a quote</ButtonLink>}
                />
              ) : (
                <div className="unifab-dashboard__request-list">
                  {recentRequests.map((request) => (
                    <Link
                      key={request.id}
                      to={`/requests/${request.id}`}
                      className="unifab-dashboard__request-row"
                    >
                      <div>
                        <strong>{getRequestReference(request)}</strong>
                        <span>{getRequestFileName(request)}</span>
                      </div>
                      <div>
                        <StatusBadge tone={getStatusTone(request.status)}>
                          {normalizeStatus(request.status)}
                        </StatusBadge>
                        <span>
                          {getRequestItemCount(request)} item
                          {getRequestItemCount(request) === 1 ? "" : "s"} /{" "}
                          {formatRequestCost(request)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </DashboardPanel>

            <div className="unifab-dashboard__split">
              <DashboardPanel
                title="Quote cart"
                description="Quoted items ready for request submission."
                action={<Link to="/cart">Open cart</Link>}
              >
                {isCartLoading ? (
                  <DashboardEmpty title="Loading cart..." />
                ) : recentCartItems.length === 0 ? (
                  <DashboardEmpty
                    title="No quoted items"
                    description="Quotes you add to cart will appear here."
                    action={<ButtonLink to="/quote">Create quote</ButtonLink>}
                  />
                ) : (
                  <div className="unifab-dashboard__compact-list">
                    {recentCartItems.map((item) => (
                      <div key={item.id} className="unifab-dashboard__compact-row">
                        <Box className="h-4 w-4" aria-hidden="true" />
                        <div>
                          <strong>{item.label || "Quoted model"}</strong>
                          <span>
                            Qty {item.quantity || 1} /{" "}
                            {formatMoney(item.estimatedCost, item.currency || currency)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </DashboardPanel>

              <DashboardPanel
                title="Saved designs"
                description="Bookmarks for models you may request later."
                action={<Link to="/saved-designs">View saved</Link>}
              >
                {isLoadingSaved ? (
                  <DashboardEmpty title="Loading saved designs..." />
                ) : recentSavedDesigns.length === 0 ? (
                  <DashboardEmpty
                    title="No saved designs"
                    description="Save designs from the library to build a shortlist."
                    action={<ButtonLink to="/designs">Browse designs</ButtonLink>}
                  />
                ) : (
                  <div className="unifab-dashboard__compact-list">
                    {recentSavedDesigns.map((design) => (
                      <Link
                        key={design.id}
                        to={`/designs/local/${design.id}`}
                        className="unifab-dashboard__compact-row"
                      >
                        <FolderOpen className="h-4 w-4" aria-hidden="true" />
                        <div>
                          <strong>{design.title || "Untitled design"}</strong>
                          <span>
                            {design.isPrintReady
                              ? "Print Ready"
                              : "Review before quote"}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </DashboardPanel>
            </div>
          </main>

          <aside className="unifab-dashboard__side">
            <DashboardPanel title="Quick actions">
              <div className="unifab-dashboard__action-list">
                <ActionLink
                  to="/quote"
                  icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}
                  title="Create Print Request"
                  description="Start with a slicer-backed quote."
                />
                <ActionLink
                  to="/cart"
                  icon={<ShoppingCart className="h-4 w-4" aria-hidden="true" />}
                  title="View Cart"
                  description="Submit selected quote items."
                />
                <ActionLink
                  to="/requests"
                  icon={<ReceiptText className="h-4 w-4" aria-hidden="true" />}
                  title="Track Requests"
                  description="Review status and payment steps."
                />
                <ActionLink
                  to="/my-designs"
                  icon={<FolderOpen className="h-4 w-4" aria-hidden="true" />}
                  title="My Designs"
                  description="Manage drafts and submissions."
                />
              </div>
            </DashboardPanel>

            <DashboardPanel title="Recent activity">
              {activityItems.length === 0 ? (
                <DashboardEmpty
                  title="No recent activity"
                  description="Your request updates and quote cart changes will appear here."
                />
              ) : (
                <div className="unifab-dashboard__activity">
                  {activityItems.map((item) => (
                    <Link key={item.key} to={item.to}>
                      <strong>{item.title}</strong>
                      <span>{item.meta}</span>
                    </Link>
                  ))}
                </div>
              )}
            </DashboardPanel>
          </aside>
        </div>
      </div>
    </PageShell>
  );
}

function StatCard({ icon, label, value, detail }) {
  return (
    <article className="unifab-dashboard__stat-card">
      <div>{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function DashboardPanel({ title, description, action, children }) {
  return (
    <section className="unifab-dashboard__panel">
      <div className="unifab-dashboard__panel-head">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action && <div className="unifab-dashboard__panel-action">{action}</div>}
      </div>
      <div className="unifab-dashboard__panel-body">{children}</div>
    </section>
  );
}

function DashboardEmpty({ title, description, action }) {
  return (
    <div className="unifab-dashboard__empty">
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}

function ActionLink({ to, icon, title, description }) {
  return (
    <Link to={to} className="unifab-dashboard__action-link">
      <span>{icon}</span>
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </Link>
  );
}
