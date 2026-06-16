import { apiFetch } from "../api/client";

export async function downloadLabel(id) {
  let d;
  try {
    const r = await apiFetch(`/api/jumingo/label/${id}`, { auth: true });
    d = await r.json();
  } catch {
    throw new Error("Label konnte nicht heruntergeladen werden. Bitte versuchen Sie es erneut.");
  }
  if (!d.label) {
    throw new Error("Label für diese Sendung ist noch nicht verfügbar.");
  }
  const a = document.createElement("a");
  a.href = `data:application/pdf;base64,${d.label}`;
  a.download = `label-${id}.pdf`;
  a.click();
}
