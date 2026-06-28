import { apiFetch } from "../api/client";

export async function downloadLabel(id) {
  let r;
  try {
    r = await apiFetch(`/api/jumingo/label/${id}`, { auth: true });
  } catch {
    throw new Error("Label konnte nicht heruntergeladen werden. Bitte versuchen Sie es erneut.");
  }

  if (!r.ok) {
    let message =
      r.status === 409 ? "Das Versandlabel ist noch nicht verfügbar. Bitte versuchen Sie es in Kürze erneut."
      : r.status === 404 ? "Label für diese Sendung ist noch nicht verfügbar."
      : r.status === 429 ? "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut."
      : "Label konnte nicht heruntergeladen werden. Bitte versuchen Sie es erneut.";
    try {
      const d = await r.json();
      if (d?.error) message = d.error;
    } catch { /* Response hat keinen JSON-Body */ }
    const err = new Error(message);
    err.status = r.status;
    throw err;
  }

  const blob = await r.blob();
  if (!blob || blob.size === 0) {
    throw new Error("Label konnte nicht heruntergeladen werden. Bitte versuchen Sie es erneut.");
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `label-${id}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
