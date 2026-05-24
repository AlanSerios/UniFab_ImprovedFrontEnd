import { useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Activity,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  DollarSign,
  FileText,
  Home,
  LayoutDashboard,
  Link as LinkIcon,
  Package,
  Printer,
  ScrollText,
  Server,
  Settings2,
  SlidersHorizontal,
  Tags,
  Users,
  Wrench,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ADMIN_NAV_GROUPS, getAdminNavItems } from "./adminNavigation";

const ADMIN_SIDEBAR_STORAGE_KEY = "unifab-admin-sidebar-collapsed";

const ADMIN_ICON_MAP = {
  Overview: LayoutDashboard,
  "Print Requests": ClipboardList,
  Users,
  "Lab Designs": BookOpen,
  "Community Review": FileText,
  "MMF Readiness": LinkIcon,
  Taxonomy: Tags,
  Materials: Package,
  "Slicer Profiles": SlidersHorizontal,
  "Quote Readiness": Activity,
  Pricing: DollarSign,
  Printers: Printer,
  Status: Server,
  Maintenance: Wrench,
  "Website Content": FileText,
  "Audit Log": ScrollText,
};

export default function AdminLayout() {
  const location = useLocation();
  const { user } = useAuth();
  const currentItem = getCurrentAdminItem(location.pathname);
  const [isCollapsed, setIsCollapsed] = useState(
    () => window.localStorage.getItem(ADMIN_SIDEBAR_STORAGE_KEY) === "true",
  );

  function toggleSidebar() {
    setIsCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(ADMIN_SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <div
      className={`unifab-admin unifab-admin-shell border-t border-slate-200 ${
        isCollapsed ? "is-sidebar-collapsed" : ""
      }`}
    >
      <div className="unifab-admin__frame mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-[100rem] gap-0">
        <aside className="unifab-admin__sidebar hidden lg:block">
          <div className="sticky top-[4.25rem] flex max-h-[calc(100vh-4.25rem)] flex-col overflow-y-auto px-3 py-4">
            <AdminIdentity
              user={user}
              currentItem={currentItem}
              collapsed={isCollapsed}
              onToggle={toggleSidebar}
            />
            <AdminNavigation
              orientation="sidebar"
              pathname={location.pathname}
              collapsed={isCollapsed}
            />
            <AdminSidebarFooter user={user} collapsed={isCollapsed} />
          </div>
        </aside>

        <div className="unifab-admin__workspace min-w-0">
          <div className="unifab-admin__mobile-bar px-4 py-3 lg:hidden">
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

function AdminIdentity({
  user,
  currentItem,
  compact = false,
  collapsed = false,
  onToggle,
}) {
  return (
    <div
      className={`unifab-admin__identity ${
        compact ? "is-compact" : ""
      } ${collapsed ? "is-collapsed" : ""}`}
    >
      <Link to="/admin" className="unifab-admin__brand" aria-label="UniFab Admin">
        <span className="unifab-admin__brand-mark">
          <LayoutDashboard className="h-4 w-4" aria-hidden="true" />
        </span>
        {!collapsed && (
          <span className="unifab-admin__brand-copy">
            <span>UniFab Admin</span>
            <small>{currentItem?.title || "Overview"}</small>
          </span>
        )}
      </Link>

      {!compact && (
        <button
          type="button"
          className="unifab-admin__collapse-button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand admin sidebar" : "Collapse admin sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      )}

      {compact && (
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Signed in
          </p>
          <p className="mt-1 truncate text-sm font-medium text-[#173760]">
            {user?.name || user?.email || "Admin"}
          </p>
          <Link
            to="/"
            className="mt-2 inline-flex text-xs font-semibold text-[#2b67ad] underline-offset-4 hover:text-[#173760] hover:underline"
          >
            Back to site
          </Link>
        </div>
      )}
    </div>
  );
}

function AdminSidebarFooter({ user, collapsed }) {
  return (
    <div className={`unifab-admin__sidebar-footer ${collapsed ? "is-collapsed" : ""}`}>
      <Link
        to="/"
        className="unifab-admin__site-link"
        aria-label="Back to UniFab site"
        title="Back to site"
      >
        <Home className="h-4 w-4" aria-hidden="true" />
        {!collapsed && <span>Back to site</span>}
      </Link>
      <div className="unifab-admin__user-chip" title={user?.name || user?.email || "Admin"}>
        <span>{getUserInitial(user)}</span>
        {!collapsed && (
          <div>
            <small>Signed in</small>
            <strong>{user?.name || user?.email || "Admin"}</strong>
          </div>
        )}
      </div>
    </div>
  );
}

function AdminNavigation({ orientation, pathname, collapsed = false }) {
  if (orientation === "mobile") {
    return (
      <div className="flex min-w-max gap-2">
        {getAdminNavItems().map((item) => (
          <AdminNavLink
            key={item.to}
            item={item}
            pathname={pathname}
            orientation="mobile"
            collapsed={false}
          />
        ))}
      </div>
    );
  }

  return (
    <nav className={`unifab-admin__nav ${collapsed ? "is-collapsed" : ""}`}>
      {ADMIN_NAV_GROUPS.map((group) => (
        <div key={group.title} className="unifab-admin__nav-group">
          {!collapsed && <p>{group.title}</p>}
          <div>
            {group.items.map((item) => (
              <AdminNavLink
                key={item.to}
                item={item}
                pathname={pathname}
                collapsed={collapsed}
              />
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function AdminNavLink({ item, pathname, orientation = "sidebar", collapsed = false }) {
  const matchedByAlias = matchesAdminItem(item, pathname);
  const Icon = ADMIN_ICON_MAP[item.title] || Settings2;

  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => {
        const active = isActive || matchedByAlias;

        if (orientation === "mobile") {
          return `unifab-admin__nav-link unifab-admin__nav-link--mobile whitespace-nowrap px-3 py-2 text-sm font-medium transition ${
            active
              ? "is-active"
              : ""
          }`;
        }

        return `unifab-admin__nav-link ${collapsed ? "is-icon-only" : ""} ${
          active ? "is-active" : ""
        }`;
      }}
      aria-label={collapsed ? item.title : undefined}
      title={collapsed ? item.title : undefined}
    >
      <Icon className="unifab-admin__nav-icon h-4 w-4" aria-hidden="true" />
      {!collapsed && (
        <span className="unifab-admin__nav-copy">
          <span>{item.title}</span>
          {orientation !== "mobile" && <small>{item.description}</small>}
        </span>
      )}
    </NavLink>
  );
}

function getUserInitial(user) {
  const label = user?.name || user?.email || "A";
  return String(label).trim().charAt(0).toUpperCase() || "A";
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
