import { useEffect, useRef, useState } from "react";
import { ChevronDown, ShoppingCart, UserRound } from "lucide-react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";

function HeaderLink({ to, children, variant = "default" }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        [
          "unifab-app__nav-link",
          variant === "primary" ? "unifab-app__nav-link--primary" : "",
          isActive ? "is-active" : "",
        ]
          .filter(Boolean)
          .join(" ")
      }
    >
      {children}
    </NavLink>
  );
}

function FooterLink({ to, children }) {
  return (
    <Link className="unifab-app__footer-link" to={to}>
      {children}
    </Link>
  );
}

function DropdownLink({ to, onClick, children }) {
  return (
    <Link to={to} onClick={onClick} role="menuitem">
      {children}
    </Link>
  );
}

function DropdownButton({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} role="menuitem">
      {children}
    </button>
  );
}

export default function AppLayout() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isAdmin, logout } = useAuth();
  const { itemCount } = useCart();
  const [isAccountOpen, setIsAccountOpen] = useState(false);
  const accountMenuRef = useRef(null);

  const handleLogout = async () => {
    setIsAccountOpen(false);
    await logout();
    navigate("/");
  };

  const accountLabel = user?.name || "Account";
  const cartCount = Number(itemCount) || 0;
  const isVerifiedUser = isAuthenticated && user?.isEmailVerified;

  useEffect(() => {
    if (!isAccountOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target)
      ) {
        setIsAccountOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsAccountOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountOpen]);

  const closeAccountMenu = () => setIsAccountOpen(false);

  const renderAccountMenu = () => {
    if (!isAuthenticated) {
      return (
        <>
          <DropdownLink to="/login" onClick={closeAccountMenu}>
            Log in
          </DropdownLink>
          <DropdownLink to="/register" onClick={closeAccountMenu}>
            Create account
          </DropdownLink>
        </>
      );
    }

    if (!user?.isEmailVerified) {
      return (
        <>
          <DropdownLink to="/verify-required" onClick={closeAccountMenu}>
            Verify Email
          </DropdownLink>
          <DropdownButton onClick={handleLogout}>Logout</DropdownButton>
        </>
      );
    }

    return (
      <>
        {isAdmin && (
          <DropdownLink to="/admin" onClick={closeAccountMenu}>
            Admin Dashboard
          </DropdownLink>
        )}
        <DropdownLink to="/requests" onClick={closeAccountMenu}>
          Requests
        </DropdownLink>
        <DropdownLink to="/my-designs" onClick={closeAccountMenu}>
          My Designs
        </DropdownLink>
        <DropdownLink to="/saved-designs" onClick={closeAccountMenu}>
          Saved
        </DropdownLink>
        <DropdownLink to="/account-settings" onClick={closeAccountMenu}>
          Account Settings
        </DropdownLink>
        <DropdownButton onClick={handleLogout}>Logout</DropdownButton>
      </>
    );
  };

  return (
    <div className="unifab-app min-h-screen bg-slate-50 text-slate-950">
      <header className="unifab-app__header print:hidden">
        <div className="unifab-app__top-strip">
          <div className="unifab-app__shell unifab-app__top-strip-inner">
            <span>UNIFAB, USTP-CDO Fabrication Laboratory</span>
            <span>Slicer-backed quotes and in-person receipt verification</span>
          </div>
        </div>

        <nav className="unifab-app__shell unifab-app__nav">
          <Link to="/" className="unifab-app__brand" aria-label="UniFab home">
            <span className="unifab-app__brand-mark" aria-hidden="true">
              <span />
            </span>
            <span>
              <strong>UniFab</strong>
              <small>Campus fabrication service</small>
            </span>
          </Link>

          <div className="unifab-app__nav-links" aria-label="Main navigation">
            {isAuthenticated && !user?.isEmailVerified ? (
              <>
                <HeaderLink to="/verify-required">Verify Email</HeaderLink>
                <HeaderLink to="/quote" variant="primary">
                  Get Quote
                </HeaderLink>
                <HeaderLink to="/about">About Us</HeaderLink>
              </>
            ) : isAuthenticated ? (
              <>
                <HeaderLink to="/dashboard">Dashboard</HeaderLink>
                <HeaderLink to="/quote" variant="primary">
                  Get Quote
                </HeaderLink>
                <HeaderLink to="/designs">Design Library</HeaderLink>
                <HeaderLink to="/about">About Us</HeaderLink>
              </>
            ) : (
              <>
                <HeaderLink to="/quote" variant="primary">
                  Get Quote
                </HeaderLink>
                <HeaderLink to="/designs">Design Library</HeaderLink>
                <HeaderLink to="/about">About Us</HeaderLink>
              </>
            )}
          </div>

          <div className="unifab-app__nav-actions">
            <NavLink
              to="/cart"
              className={({ isActive }) =>
                [
                  "unifab-app__icon-link",
                  isActive ? "is-active" : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              }
              aria-label={
                cartCount > 0 ? `Cart, ${cartCount} items` : "Cart, empty"
              }
            >
              <ShoppingCart size={20} aria-hidden="true" strokeWidth={2.2} />
              {cartCount > 0 && (
                <span className="unifab-app__cart-badge">{cartCount}</span>
              )}
            </NavLink>

            <div className="unifab-app__account-menu" ref={accountMenuRef}>
              <button
                type="button"
                className="unifab-app__user-button"
                aria-haspopup="menu"
                aria-expanded={isAccountOpen}
                aria-label={
                  isAuthenticated
                    ? `${accountLabel} account menu`
                    : "Account menu"
                }
                onClick={() => setIsAccountOpen((current) => !current)}
              >
                <UserRound size={20} aria-hidden="true" strokeWidth={2.2} />
                <ChevronDown size={14} aria-hidden="true" strokeWidth={2.4} />
              </button>

              {isAccountOpen && (
                <div className="unifab-app__dropdown" role="menu">
                  {isVerifiedUser && (
                    <p className="unifab-app__dropdown-label" role="presentation">
                      {accountLabel}
                    </p>
                  )}
                  {renderAccountMenu()}
                </div>
              )}
            </div>
          </div>
        </nav>
      </header>

      <div className="unifab-app__content">
        <Outlet />
      </div>

      <footer className="unifab-app__footer print:hidden">
        <div className="unifab-app__shell unifab-app__footer-inner">
          <section className="unifab-app__footer-brand">
            <Link to="/" className="unifab-app__brand" aria-label="UniFab home">
              <span className="unifab-app__brand-mark" aria-hidden="true">
                <span />
              </span>
              <span>
                <strong>UniFab</strong>
                <small>USTP-CDO FabLab</small>
              </span>
            </Link>
            <p>
              UniFab supports the USTP-CDO Fabrication Laboratory with
              slicer-backed quote previews, library discovery, print request
              submission, and clear request tracking.
            </p>
            <div className="unifab-app__footer-meta">
              <span>USTP-CDO campus fabrication laboratory</span>
              <span>Service schedule: confirm current lab hours before visiting</span>
              <span>Payment: backend slip with in-person receipt verification</span>
            </div>
          </section>

          <nav className="unifab-app__footer-grid" aria-label="Footer navigation">
            <section>
              <h2>Start</h2>
              <FooterLink to="/quote">Start quote</FooterLink>
              <FooterLink to="/designs">Design Library</FooterLink>
              <FooterLink to="/cart">Quote cart</FooterLink>
              <FooterLink to="/requests">Track requests</FooterLink>
            </section>

            <section>
              <h2>FabLab</h2>
              <FooterLink to="/about">About Us</FooterLink>
              <FooterLink to="/printers">Printer information</FooterLink>
              <FooterLink to="/terms">Terms and Conditions</FooterLink>
              <p>Admin-managed materials, pricing, colors, and slicer profiles.</p>
            </section>

            <section>
              <h2>Support</h2>
              <p>Guests can preview quotes before signing in.</p>
              <p>Verified email is required for cart and request submission.</p>
              <p>Print Ready files require FabLab review before instant quote.</p>
            </section>

            <section>
              <h2>Account</h2>
              {isAuthenticated ? (
                <>
                  <FooterLink to="/dashboard">Dashboard</FooterLink>
                  <FooterLink to="/account-settings">{accountLabel}</FooterLink>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="unifab-app__footer-button"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <FooterLink to="/login">Log in</FooterLink>
                  <FooterLink to="/register">Create account</FooterLink>
                </>
              )}
            </section>
          </nav>
        </div>
      </footer>
    </div>
  );
}
