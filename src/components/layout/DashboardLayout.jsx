import React, { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";
import { DashboardSidebar } from "./DashboardSidebar";

export function DashboardLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const initials = (user?.company_name || user?.name || "?").charAt(0).toUpperCase();

  const activePage =
    location.pathname === "/calculator" ? "calculator" : "";

  const navigateTo = (id) => {
    setSidebarOpen(false);
    if (id === "calculator") {
      navigate("/calculator");
    } else {
      navigate(`/dashboard?page=${id}`);
    }
  };

  return (
    <div className="app-shell">
      <DashboardSidebar
        page={activePage}
        navigateTo={navigateTo}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />
      <main className="main-content">
        <div className="mobile-topbar">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}>
            <Icon n="menu" s={22} />
          </button>
          <div className="topbar-brand">ConfidaraExpress</div>
          <div className="user-avatar">{initials}</div>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
