import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { LoadingScreen } from "../components/common/LoadingScreen";

export function ProtectedRoute({ children }) {
  const { authed, loadingUser } = useAuth();
  if (loadingUser) return <LoadingScreen />;
  if (!authed) return <Navigate to="/login" replace />;
  return children;
}
