import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ADMIN_NAV_GROUPS, getAdminNavItems } from "./adminNavigation";

export default function AdminLayout() {
  const location = useLocation();
  const { user } = useAuth();
  const currentItem = getCurrentAdminItem(location.pathname);

  return (
    <div className="border-t border-slate-200 bg-[#f7f6f3]">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-[92rem] gap-0 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="hidden border-r border-slate-200 bg-white lg:block">
          <div className="sticky top-[4.25rem] flex max-h-[calc(100vh-4.25rem)] flex-col gap-6 overflow-y-auto px-4 py-5">
            <AdminIdentity user={user} currentItem={currentItem} />
            <AdminNavigation orientation="sidebar" pathname={location.pathname} />
          </div>
        </aside>

        <div className="min-w-0">
          <div className="border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
            <AdminIdentity user={user} currentItem={currentItem} compact />
            <div className="mt-3 overflow-x-auto pb-1">
              <AdminNavigation orientation="mobile" pathname={location.pathname} />
            </div>
          </div>

          <Outlet />
        </div>
      </div>
    </div>
  );
}

function AdminIdentity({ user, currentItem, compact = false }) {
  return (
    <div className={compact ? "flex items-center justify-between gap-3" : ""}>
      <div>
        <Link
          to="/admin"
          className="text-lg font-semibold tracking-tight text-slate-950"
        >
          UniFab Admin
        </Link>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {currentItem?.title || "Overview"}
        </p>
      </div>
      <div className={compact ? "text-right" : "mt-4"}>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
          Signed in
        </p>
        <p className="mt-1 truncate text-sm font-medium text-slate-700">
          {user?.name || user?.email || "Admin"}
        </p>
        <Link
          to="/"
          className="mt-2 inline-flex text-xs font-semibold text-slate-500 underline-offset-4 hover:text-slate-950 hover:underline"
        >
          Back to site
        </Link>
      </div>
    </div>
  );
}

function AdminNavigation({ orientation, pathname }) {
  if (orientation === "mobile") {
    return (
      <div className="flex min-w-max gap-2">
        {getAdminNavItems().map((item) => (
          <AdminNavLink
            key={item.to}
            item={item}
            pathname={pathname}
            orientation="mobile"
          />
        ))}
      </div>
    );
  }

  return (
    <nav className="space-y-6">
      {ADMIN_NAV_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            {group.title}
          </p>
          <div className="mt-2 space-y-1">
            {group.items.map((item) => (
              <AdminNavLink key={item.to} item={item} pathname={pathname} />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function AdminNavLink({ item, pathname, orientation = "sidebar" }) {
  const matchedByAlias = matchesAdminItem(item, pathname);

  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => {
        const active = isActive || matchedByAlias;

        if (orientation === "mobile") {
          return `whitespace-nowrap rounded-md border px-3 py-2 text-sm font-medium transition ${
            active
              ? "border-slate-950 bg-slate-950 text-white"
              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950"
          }`;
        }

        return `block rounded-md border px-3 py-2 transition ${
          active
            ? "border-slate-200 bg-slate-100 text-slate-950"
            : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950"
        }`;
      }}
    >
      <span className="block text-sm font-semibold">{item.title}</span>
      {orientation !== "mobile" && (
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">
          {item.description}
        </span>
      )}
    </NavLink>
  );
}

function getCurrentAdminItem(pathname) {
  return getAdminNavItems().find((item) => matchesAdminItem(item, pathname));
}

function matchesAdminItem(item, pathname) {
  if (item.end) {
    return pathname === item.to;
  }

  return (item.match || [item.to]).some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}
