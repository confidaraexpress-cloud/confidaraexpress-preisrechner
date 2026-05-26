import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { API, authH } from "../api/client";
import { Icon } from "../components/ui/Icon";
import { Overview } from "../components/dashboard/Overview";
import { ShipmentsList } from "../components/dashboard/ShipmentsList";
import { InvoicesList } from "../components/dashboard/InvoicesList";
import { Profile } from "../components/dashboard/Profile";
import { useAuth } from "../context/AuthContext";

const CalculatorPage = React.lazy(() => import("./CalculatorPage"));

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [page, setPage] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shipments, setShipments] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [bookingToast, setBookingToast] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    setLoadError("");
    Promise.all([
      fetch(`${API}/kunde/shipments`, { headers: authH() }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch(`${API}/kunde/invoices`, { headers: authH() }).then(r => { if (!r.ok) throw new Error(); return r.json(); }),
    ]).then(([s, inv]) => {
      setShipments(s.shipments || []);
      setInvoices(inv.invoices || []);
      setLoading(false);
    }).catch(() => {
      setLoadError("Daten konnten nicht geladen werden. Bitte laden Sie die Seite neu.");
      setLoading(false);
    });
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Show success toast when returning from a completed booking
  useEffect(() => {
    if (location.state?.justBooked) {
      setBookingToast(true);
      navigate(location.pathname, { replace: true, state: {} });
      const t = setTimeout(() => setBookingToast(false), 5000);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const initials = (user?.company_name || user?.name || "?").charAt(0).toUpperCase();

  const navItems = [
    { id: "overview", label: "Übersicht", icon: "dashboard" },
    { id: "new", label: "Neue Sendung", icon: "plus" },
    { id: "shipments", label: "Sendungen", icon: "truck" },
    { id: "invoices", label: "Rechnungen", icon: "invoice" },
    { id: "profile", label: "Mein Profil", icon: "user" },
  ];

  const navigateTo = (id) => { setPage(id); setSidebarOpen(false); };

  return (
    <div className="app-shell">
      {sidebarOpen && <div className="sidebar-overlay open" onClick={() => setSidebarOpen(false)} style={{ zIndex: 198 }} />}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`} style={{ zIndex: 199 }}>
        <div className="sidebar-brand">
          <div className="logo-mark" style={{ width: 30, height: 30, fontSize: 12 }}>CE</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 14, color: "var(--navy)" }}>ConfidaraExpress</div>
            <div style={{ fontSize: 10, color: "var(--gray400)" }}>B2B Versand</div>
          </div>
          <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)}><Icon n="close" s={18} /></button>
        </div>
        <nav className="sidebar-nav">
          <div className="nav-section-label">Navigation</div>
          {navItems.map(item => (
            <button key={item.id} className={`nav-item ${page === item.id ? "active" : ""}`} onClick={() => navigateTo(item.id)}>
              <Icon n={item.icon} s={16} /> {item.label}
            </button>
          ))}
          <div className="nav-section-label" style={{ marginTop: 8 }}>Plattform</div>
          <button className="nav-item" onClick={() => navigate("/calculator")}><Icon n="zap" s={16} /> Preisrechner</button>
        </nav>
        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{initials}</div>
            <div className="user-info" style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name">{user?.company_name || user?.name}</div>
              <div className="user-role">{user?.email || "B2B Konto"}</div>
            </div>
            <button className="logout-btn" onClick={() => { logout(); navigate("/login"); }} title="Abmelden"><Icon n="logout" s={14} /></button>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <div className="mobile-topbar">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}><Icon n="menu" s={22} /></button>
          <div style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: 15, color: "var(--navy)" }}>ConfidaraExpress</div>
          <div className="user-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{initials}</div>
        </div>

        {bookingToast && (
          <div style={{ padding: "16px 28px 0" }}>
            <div className="alert alert-success">
              <Icon n="shield" s={16} /> Sendung erfolgreich gebucht! Ihre Sendungsliste wurde aktualisiert.
            </div>
          </div>
        )}

        {loadError && (
          <div style={{ padding: "16px 28px 0" }}>
            <div className="alert alert-error" style={{ gap: 8 }}>
              <Icon n="x" s={16} />{loadError}
            </div>
          </div>
        )}

        {page === "overview" && (
          <Overview
            user={user}
            shipments={shipments}
            invoices={invoices}
            loading={loading}
            onNewShipment={() => setPage("new")}
            onAllShipments={() => setPage("shipments")}
          />
        )}

        {page === "new" && (
          <>
            <div className="page-header"><div><div className="page-header-title">Neue Sendung</div></div></div>
            <div className="page-body">
              <Suspense fallback={<div className="loading-center"><span className="spinner spinner-dark" /></div>}>
                <CalculatorPage />
              </Suspense>
            </div>
          </>
        )}

        {page === "shipments" && (
          <ShipmentsList shipments={shipments} loading={loading} />
        )}

        {page === "invoices" && (
          <InvoicesList invoices={invoices} loading={loading} />
        )}

        {page === "profile" && (
          <Profile user={user} />
        )}
      </main>
    </div>
  );
}
