# Beauty by Rita Chedid — Appointment & POS App

A self-contained PWA (Progressive Web App) for managing beauty salon appointments, customers, inventory and point-of-sale transactions. All data is stored in **Firebase Realtime Database** with real-time listeners.

---

## ✅ Completed Features

| Feature | Details |
|---|---|
| **Session Auth** | Password `ritachedid123`, 8-hour session via `sessionStorage` |
| **Dashboard** | Today's & upcoming appointments, quick stats |
| **Calendar** | Monthly calendar with day-detail drill-down |
| **Appointments** | Create / edit / delete appointments; status badges; WhatsApp reminder |
| **Customers** | Full CRUD; auto-merged from Firebase `customers/` + appointment data |
| **History** | Per-customer appointment history |
| **Inventory** | Real-time Firebase `products/` node; stats bar; Excel export/import (SheetJS) |
| **POS** | Full point-of-sale: product grid, barcode scanner input, cart, discount, VAT, receipt, void; sales saved to Firebase `sales/`; stock auto-updated in Firebase |
| **Debts** | Debt ledger with CRUD |
| **Settings** | WhatsApp number, reminder template, service tags |
| **PWA** | manifest.json, sw.js (network-first, cache v4), apple-touch-icon |

---

## 🗂️ File Structure

```
index.html          ← Main app (inline CSS + JS, fully self-contained)
manifest.json       ← PWA manifest (name: "Beauty by Rita Chedid")
sw.js               ← Service worker (network-first, cache "neoskin-v4")
images/icon-512.png ← App icon
css/style.css       ← (External copy — index.html is the authoritative source)
js/app.js           ← (External copy — index.html is the authoritative source)
README.md           ← This file
FIREBASE_SETUP.md   ← Firebase setup instructions
```

---

## 🔥 Firebase Configuration

| Key | Value |
|---|---|
| Database URL | `https://ritachedid-default-rtdb.firebaseio.com/` |
| SDK | Firebase compat v10.7.1 |

### Firebase Realtime Database nodes

| Node | Used by |
|---|---|
| `customers/` | Customers CRUD |
| `appointments/` | Appointments CRUD |
| `services/` | Service tags |
| `settings/` | WhatsApp + reminder settings |
| `products/` | Inventory items |
| `sales/` | POS sales records |

### Firebase Rules (set in Firebase Console)
```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

---

## 📱 PWA Install

- Open in Safari → Share → Add to Home Screen
- Works on iOS and Android
- Offline-capable via service worker cache

---

## 🛒 POS Section Details

- **Product Selection** — product grid from Firebase `products/`, click to add to cart
- **Barcode Scanner** — type/scan barcode + Enter to add by barcode
- **Search** — filter products by name in real-time
- **Cart** — quantity editable, line totals auto-calculated
- **Customer** — name + phone with autocomplete from Firebase `customers/`
- **Loyalty Points** — 1 point per $1 spent (displayed from customer record)
- **Discount** — % or fixed $ amount
- **VAT** — configurable via `posSettings.taxRate` (default 0%)
- **Process Payment** → saves to Firebase `sales/` + decrements stock in Firebase `products/`
- **Receipt** — 80mm thermal-style receipt (auto-scrolls into view)
- **Print** — `window.print()` prints only the receipt (CSS `@media print`)
- **Void** — marks sale as voided in Firebase + restores stock quantities

---

## 🔑 Auth

- Password: `ritachedid123`
- Session key: `ns_auth` in `sessionStorage`
- Duration: 8 hours

---

## 📦 CDN Libraries

- Firebase compat v10.7.1
- Font Awesome 6.4.0
- Google Fonts — Inter
- SheetJS (xlsx-0.20.0) — Excel import/export for Inventory

---

## 🚀 Deployment

Go to the **Publish tab** to deploy this project live.

---

## 📋 Known Limitations / Next Steps

- `posSettings.taxRate` is hardcoded to `0`. To enable VAT, update `posSettings.taxRate` in the JS (or wire it to Firebase settings).
- POS does **not** yet have a built-in "Sales History" sub-view — sales are stored in Firebase `sales/` and can be exported from the console or a future report tab.
- `state.customers` loyalty points are read-only in POS (display only). Writing loyalty points back requires a dedicated `customers/{id}/loyaltyPoints` update — can be added as a next step.
