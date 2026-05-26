import React from "react";

export function LoadingScreen() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#070f20" }}>
      <div className="text-center">
        <div className="logo-mark" style={{ margin: "0 auto 16px", width: 48, height: 48, fontSize: 20 }}>CE</div>
        <div className="spinner" style={{ width: 28, height: 28, margin: "0 auto" }} />
      </div>
    </div>
  );
}
