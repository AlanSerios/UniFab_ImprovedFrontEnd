import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, ShoppingCart, UserRound, X } from "lucide-react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";

function HeaderLink({ to, children, variant = "default", onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);

  const handleLogout = async () => {
    setIsAccountOpen(false);
    setIsMobileMenuOpen(false);
    await logout();
    navigate("/");
  };

  const accountLabel = user?.name || "Account";
  const cartCount = Number(itemCount) || 0;
  const isVerifiedUser = isAuthenticated && user?.isEmailVerified;
  const currentYear = new Date().getFullYear();

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

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    };

    document.body.classList.add("is-unifab-mobile-menu-open");
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("is-unifab-mobile-menu-open");
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  const closeAccountMenu = () => setIsAccountOpen(false);
  const closeMobileMenu = () => setIsMobileMenuOpen(false);

  const primaryNavLinks =
    isAuthenticated && !user?.isEmailVerified
      ? [
          { to: "/verify-required", label: "Verify Email" },
          { to: "/quote", label: "Get Quote", variant: "primary" },
          { to: "/about", label: "About Us" },
        ]
      : isAuthenticated
        ? [
            { to: "/dashboard", label: "Dashboard" },
            { to: "/quote", label: "Get Quote", variant: "primary" },
            { to: "/designs", label: "Design Library" },
            { to: "/about", label: "About Us" },
          ]
        : [
            { to: "/quote", label: "Get Quote", variant: "primary" },
            { to: "/designs", label: "Design Library" },
            { to: "/about", label: "About Us" },
          ];

  const renderAccountMenu = (onNavigate = closeAccountMenu) => {
    if (!isAuthenticated) {
      return (
        <>
          <DropdownLink to="/login" onClick={onNavigate}>
            Log in
          </DropdownLink>
          <DropdownLink to="/register" onClick={onNavigate}>
            Create account
          </DropdownLink>
        </>
      );
    }

    if (!user?.isEmailVerified) {
      return (
        <>
          <DropdownLink to="/verify-required" onClick={onNavigate}>
            Verify Email
          </DropdownLink>
          <DropdownButton onClick={handleLogout}>Logout</DropdownButton>
        </>
      );
    }

    return (
      <>
        {isAdmin && (
          <DropdownLink to="/admin" onClick={onNavigate}>
            Admin Dashboard
          </DropdownLink>
        )}
        <DropdownLink to="/requests" onClick={onNavigate}>
          Requests
        </DropdownLink>
        <DropdownLink to="/my-designs" onClick={onNavigate}>
          My Designs
        </DropdownLink>
        <DropdownLink to="/saved-designs" onClick={onNavigate}>
          Saved
        </DropdownLink>
        <DropdownLink to="/account-settings" onClick={onNavigate}>
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
          <button
            type="button"
            className="unifab-app__menu-button"
            aria-label={
              isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"
            }
            aria-expanded={isMobileMenuOpen}
            aria-controls="unifab-mobile-menu"
            onClick={() => setIsMobileMenuOpen((current) => !current)}
          >
            {isMobileMenuOpen ? (
              <X size={20} aria-hidden="true" strokeWidth={2.2} />
            ) : (
              <Menu size={20} aria-hidden="true" strokeWidth={2.2} />
            )}
          </button>

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
            {primaryNavLinks.map((link) => (
              <HeaderLink key={link.to} to={link.to} variant={link.variant}>
                {link.label}
              </HeaderLink>
            ))}
          </div>

          <div className="unifab-app__nav-actions" ref={accountMenuRef}>
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

            <div className="unifab-app__account-menu unifab-app__account-menu--desktop">
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

            <div
              className="unifab-app__mobile-account-menu"
              style={{ display: "inline-flex" }}
            >
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

        <div className="unifab-app__mobile-action-rail" aria-label="Mobile account actions">
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

          <div
            className="unifab-app__mobile-floating-account"
            style={{ display: "inline-flex", width: 40, height: 40 }}
          >
            <button
              type="button"
              className="unifab-app__icon-link unifab-app__mobile-user-action"
              style={{ display: "inline-flex", width: 40, height: 40 }}
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

        <div
          className={`unifab-app__mobile-menu-scrim ${isMobileMenuOpen ? "is-open" : ""}`}
          aria-hidden="true"
          onClick={closeMobileMenu}
        />
        <aside
          id="unifab-mobile-menu"
          className={`unifab-app__mobile-menu ${isMobileMenuOpen ? "is-open" : ""}`}
          aria-hidden={!isMobileMenuOpen}
          aria-label="Mobile navigation"
          inert={!isMobileMenuOpen}
        >
          <div className="unifab-app__mobile-menu-header">
            <span>UniFab navigation</span>
            <button
              type="button"
              aria-label="Close navigation menu"
              onClick={closeMobileMenu}
            >
              <X size={20} aria-hidden="true" strokeWidth={2.2} />
            </button>
          </div>

          <nav className="unifab-app__mobile-menu-links" aria-label="Mobile primary navigation">
            {primaryNavLinks.map((link) => (
              <HeaderLink
                key={link.to}
                to={link.to}
                variant={link.variant}
                onClick={closeMobileMenu}
              >
                {link.label}
              </HeaderLink>
            ))}
            <HeaderLink to="/cart" onClick={closeMobileMenu}>
              {cartCount > 0 ? `Cart (${cartCount})` : "Cart"}
            </HeaderLink>
          </nav>

          <div className="unifab-app__mobile-menu-account">
            <span>{isAuthenticated ? accountLabel : "Account"}</span>
            {renderAccountMenu(closeMobileMenu)}
          </div>
        </aside>
      </header>

      <div className="unifab-app__content">
        <Outlet />
      </div>

      <footer className="unifab-app__footer print:hidden">
        <div className="unifab-app__shell unifab-app__footer-inner">
          <div className="unifab-app__footer-main">
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
                University 3D printing and fabrication support for USTP-CDO
                students, faculty, staff, and campus partners.
              </p>
            </section>

            <section className="unifab-app__footer-details" aria-label="FabLab details">
              <div>
                <span>Location</span>
                <p>
                  University of Science and Technology of Southern Philippines,
                  Cagayan de Oro City
                </p>
              </div>
              <div>
                <span>Contact</span>
                <p>Contact details to be announced.</p>
              </div>
              <div>
                <span>Operating hours</span>
                <p>Operating hours to be announced.</p>
              </div>
            </section>

            <nav className="unifab-app__footer-links" aria-label="Footer navigation">
              <h2>Quick Links</h2>
              <FooterLink to="/quote">Get Quote</FooterLink>
              <FooterLink to="/designs">Design Library</FooterLink>
              <FooterLink to="/about">About Us</FooterLink>
              <FooterLink to="/printers">Printers</FooterLink>
              <FooterLink to="/terms">Terms</FooterLink>
            </nav>
          </div>

          <div className="unifab-app__footer-bottom">
            <span>
              &copy; {currentYear} UniFab, USTP-CDO Fabrication Laboratory.
            </span>
            <span>University fabrication service platform.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
