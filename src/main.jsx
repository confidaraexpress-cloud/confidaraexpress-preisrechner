import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./styles/index.css";
import { AuthProvider } from "./context/AuthContext";
import { ContentErrorBoundary } from "./components/common/ContentErrorBoundary";
import App from "./App";

/* Die äußerste Fehlergrenze. Sie liegt bewusst ÜBER Router und AuthProvider:
   die Bereichsgrenzen weiter innen hängen selbst am Router und können einen
   Fehler im Router, im AuthProvider oder in App selbst gar nicht sehen. Genau
   dort entstünde sonst der weiße Bildschirm, gegen den das ganze Muster
   gebaut ist.

   Sie ist die LETZTE Auffanglinie, nicht die erste: alles, was hier ankommt,
   hat schon eine Bereichsgrenze passiert (oder lag außerhalb aller). */
createRoot(document.getElementById("root")).render(
  <ContentErrorBoundary bereich="wurzel">
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </ContentErrorBoundary>
);
