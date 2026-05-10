import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

function HeaderLink({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-md px-2.5 py-1.5 transition ${
          isActive
            ? "bg-slate-100 text-slate-950"
            : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isAdmin, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur print:hidden">
        <nav className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <Link
            to="/"
            className="text-xl font-semibold tracking-tight text-slate-950"
          >
            UniFab
          </Link>

          <div className="flex flex-wrap items-center gap-1 text-sm font-medium">
            {isAuthenticated ? (
              <>
                <HeaderLink to="/dashboard">Dashboard</HeaderLink>
                <HeaderLink to="/quote">Get Quote</HeaderLink>
                <HeaderLink to="/designs">Designs</HeaderLink>
                <HeaderLink to="/design-requests">Design Requests</HeaderLink>
                <HeaderLink to="/requests">Requests</HeaderLink>
                <HeaderLink to="/printers">Printers</HeaderLink>
                <HeaderLink to="/my-designs">My Designs</HeaderLink>

                {isAdmin && <HeaderLink to="/admin">Admin</HeaderLink>}

                <HeaderLink to="/account-settings">{user?.name}</HeaderLink>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-md px-2.5 py-1.5 text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <HeaderLink to="/quote">Get Quote</HeaderLink>
                <HeaderLink to="/designs">Designs</HeaderLink>
                <HeaderLink to="/printers">Printers</HeaderLink>
                <HeaderLink to="/login">Login</HeaderLink>
                <HeaderLink to="/register">Register</HeaderLink>
              </>
            )}
          </div>
        </nav>
      </header>

      <Outlet />
    </div>
  );
}
