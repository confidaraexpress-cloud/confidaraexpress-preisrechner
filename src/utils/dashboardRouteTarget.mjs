// Ziel einer Navigation aus den Routen-Seiten des Kundenbereichs (/calculator, /booking, Lagerdetails) in den
// page-State der Übersicht (F1, Premium-Redesign Etappe 1).
//
// Eine Supportmitteilung der Glocke trägt die Ticket-ID mit. DashboardPage liest `?ticket=` als geprüfte
// positive Ganzzahl, öffnet den Vorgang und bereinigt die Adresse. Vorher ging die ID auf diesen Routen
// verloren, und die Glocke öffnete nur die Liste. Andere Angaben wandern nicht in die Adresse.
export function dashboardRouteTarget(id, filter = null) {
  if (id === "calculator") return "/calculator";
  const ziel = `/dashboard?page=${id}`;
  const ticket = Number(filter?.ticket);
  if (id === "support" && Number.isInteger(ticket) && ticket > 0) return `${ziel}&ticket=${ticket}`;
  return ziel;
}
