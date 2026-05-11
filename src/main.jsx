import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Package, Truck, ShieldCheck, Mail, ArrowRight, Calculator } from "lucide-react";
import "./styles.css";

const countries = [
  { code: "DE", name: "Deutschland", zone: 1 },
  { code: "AT", name: "Österreich", zone: 2 },
  { code: "CH", name: "Schweiz", zone: 3 },
  { code: "NL", name: "Niederlande", zone: 2 },
  { code: "FR", name: "Frankreich", zone: 2 },
  { code: "IT", name: "Italien", zone: 3 },
  { code: "ES", name: "Spanien", zone: 3 },
  { code: "PL", name: "Polen", zone: 2 },
  { code: "TR", name: "Türkei", zone: 4 },
  { code: "US", name: "USA", zone: 5 },
];

const shippingTypes = {
  standard: { label: "Standard", multiplier: 1, days: "3–7 Werktage" },
  express: { label: "Express", multiplier: 1.45, days: "1–3 Werktage" },
  economy: { label: "Economy", multiplier: 0.88, days: "5–12 Werktage" },
};

function money(value) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function calculatePrice(form) {
  const length = Number(form.length) || 0;
  const width = Number(form.width) || 0;
  const height = Number(form.height) || 0;
  const weight = Number(form.weight) || 0;
  const country = countries.find((c) => c.code === form.country) || countries[0];
  const shipping = shippingTypes[form.shippingType];

  const volumeWeight = (length * width * height) / 5000;
  const chargeableWeight = Math.max(weight, volumeWeight, 1);

  const base = 6.9;
  const zoneFee = country.zone * 4.2;
  const kgFee = chargeableWeight * (2.8 + country.zone * 0.65);
  const fragileFee = form.fragile ? 6.5 : 0;
  const pickupFee = form.pickup ? 8.9 : 0;

  const subtotal = (base + zoneFee + kgFee + fragileFee + pickupFee) * shipping.multiplier;
  const serviceFee = Math.max(subtotal * 0.08, 2.5);
  const total = subtotal + serviceFee;

  return {
    volumeWeight,
    chargeableWeight,
    subtotal,
    serviceFee,
    total,
    days: shipping.days,
    country: country.name,
    shipping: shipping.label,
  };
}

function App() {
  const [form, setForm] = useState({
    length: "40",
    width: "30",
    height: "20",
    weight: "5",
    country: "DE",
    shippingType: "standard",
    content: "",
    fragile: false,
    pickup: false,
    name: "",
    email: "",
    phone: "",
    note: "",
  });

  const price = useMemo(() => calculatePrice(form), [form]);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const bookingMail = () => {
    const subject = encodeURIComponent("Versandbuchung über Confidaraexpress");
    const body = encodeURIComponent(
`Neue Versandanfrage

Preis: ${money(price.total)}
Versandart: ${price.shipping}
Zielland: ${price.country}
Maße: ${form.length} x ${form.width} x ${form.height} cm
Gewicht: ${form.weight} kg
Abrechnungsgewicht: ${price.chargeableWeight.toFixed(2)} kg
Inhalt: ${form.content || "-"}
Zerbrechlich: ${form.fragile ? "Ja" : "Nein"}
Abholung gewünscht: ${form.pickup ? "Ja" : "Nein"}

Kunde:
Name: ${form.name || "-"}
E-Mail: ${form.email || "-"}
Telefon: ${form.phone || "-"}
Bemerkung: ${form.note || "-"}`
    );
    window.location.href = `mailto:confidaraexpress@gmail.com?subject=${subject}&body=${body}`;
  };

  return (
    <main>
      <section className="hero">
        <nav>
          <div className="brand"><Package size={28} /> Confidaraexpress</div>
          <a href="#calculator">Preis berechnen</a>
        </nav>
        <div className="heroGrid">
          <div>
            <p className="eyebrow">Internationaler Versand leicht gemacht</p>
            <h1>Versandpreis sofort online berechnen.</h1>
            <p className="lead">
              Geben Sie Maße, Gewicht, Zielland und Versandart ein. Sie sehen direkt den geschätzten Preis und können die Buchung sofort anfragen.
            </p>
            <div className="badges">
              <span><ShieldCheck size={18}/> Transparente Preise</span>
              <span><Truck size={18}/> Standard & Express</span>
              <span><Calculator size={18}/> Sofort-Kalkulation</span>
            </div>
          </div>
          <div className="heroCard">
            <span>Aktueller Beispielpreis</span>
            <strong>{money(price.total)}</strong>
            <small>{price.shipping} nach {price.country}</small>
          </div>
        </div>
      </section>

      <section id="calculator" className="wrap">
        <div className="card calculator">
          <div className="form">
            <h2>Versanddaten</h2>
            <div className="grid3">
              <label>Länge cm<input value={form.length} onChange={e=>update("length", e.target.value)} type="number" min="1"/></label>
              <label>Breite cm<input value={form.width} onChange={e=>update("width", e.target.value)} type="number" min="1"/></label>
              <label>Höhe cm<input value={form.height} onChange={e=>update("height", e.target.value)} type="number" min="1"/></label>
            </div>
            <div className="grid2">
              <label>Gewicht kg<input value={form.weight} onChange={e=>update("weight", e.target.value)} type="number" min="0.1" step="0.1"/></label>
              <label>Zielland<select value={form.country} onChange={e=>update("country", e.target.value)}>
                {countries.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select></label>
            </div>
            <label>Versandart<select value={form.shippingType} onChange={e=>update("shippingType", e.target.value)}>
              {Object.entries(shippingTypes).map(([key, item]) => <option key={key} value={key}>{item.label} · {item.days}</option>)}
            </select></label>
            <label>Inhalt der Sendung<input value={form.content} onChange={e=>update("content", e.target.value)} placeholder="z. B. Textilien, Metall, Ersatzteile"/></label>
            <div className="checks">
              <label><input type="checkbox" checked={form.fragile} onChange={e=>update("fragile", e.target.checked)}/> Zerbrechliche Ware</label>
              <label><input type="checkbox" checked={form.pickup} onChange={e=>update("pickup", e.target.checked)}/> Abholung gewünscht</label>
            </div>

            <h2>Kundendaten</h2>
            <div className="grid2">
              <label>Name<input value={form.name} onChange={e=>update("name", e.target.value)} placeholder="Ihr Name"/></label>
              <label>E-Mail<input value={form.email} onChange={e=>update("email", e.target.value)} placeholder="name@email.de"/></label>
            </div>
            <label>Telefon<input value={form.phone} onChange={e=>update("phone", e.target.value)} placeholder="+49 ..."/></label>
            <label>Bemerkung<textarea value={form.note} onChange={e=>update("note", e.target.value)} placeholder="Besondere Hinweise zur Sendung"/></label>
          </div>

          <aside className="summary">
            <h2>Ihr Preis</h2>
            <div className="price">{money(price.total)}</div>
            <p className="muted">Geschätzte Laufzeit: {price.days}</p>
            <dl>
              <div><dt>Zielland</dt><dd>{price.country}</dd></div>
              <div><dt>Versandart</dt><dd>{price.shipping}</dd></div>
              <div><dt>Volumengewicht</dt><dd>{price.volumeWeight.toFixed(2)} kg</dd></div>
              <div><dt>Abrechnungsgewicht</dt><dd>{price.chargeableWeight.toFixed(2)} kg</dd></div>
              <div><dt>Service</dt><dd>{money(price.serviceFee)}</dd></div>
            </dl>
            <button onClick={bookingMail}>
              Versand buchen <ArrowRight size={18}/>
            </button>
            <p className="fineprint">
              Hinweis: Dies ist ein Richtpreis. Der finale Preis kann nach Prüfung der Sendungsdaten bestätigt werden.
            </p>
          </aside>
        </div>
      </section>

      <footer>
        <strong>Confidaraexpress</strong>
        <span>Schnelle Versandkalkulation und Buchungsanfrage</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
