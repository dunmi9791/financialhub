# FinanceHub Frontend

A production-grade Odoo 17/18 addon delivering a modern OWL-based finance reporting and bank reconciliation UI inside the standard Odoo web client.

---

## Features

| Area | What you get |
|------|-------------|
| **Dashboard** | Cash position, AR/AP totals, net profit MTD, unreconciled line count |
| **Financial Reports** | Balance Sheet, P&L, Cash Flow, Trial Balance, General Ledger, Aged AR/AP, Journal Report |
| **Report Filters** | Date presets, company, journals, analytic accounts, partners, compare mode |
| **Drill-down** | Click any report row → slide-in drawer with paginated journal items |
| **Export** | PDF (wkhtmltopdf) and XLSX (xlsxwriter) download |
| **Saved Configs** | Save/share/duplicate filter presets, set per-user default |
| **Custom Report Builder** | No-code: pick model → filters → columns → grouping → preview → save |
| **Bank Reconciliation** | Statement lines, auto-match suggestions, write-off, split, create payment, mark review, batch auto-reconcile, full audit trail |
| **Security** | Odoo group-based access; record rules for private vs. shared configs |

---

## Requirements

- Odoo **17.0** or **18.0**
- Python packages: `xlsxwriter` (optional, for XLSX export)
- Depends: `account`, `account_accountant`, `analytic`, `base_setup`, `web`

---

## Installation

### 1. Copy the addon

```bash
cp -r financehub_frontend /path/to/odoo/addons/
```

### 2. Update the addon list

In Odoo: **Settings → Technical → Activate Developer Mode**, then **Apps → Update App List**.

### 3. Install

Search for **FinanceHub Frontend** in the Apps list and click **Install**.

### 4. Optional: install xlsxwriter

```bash
pip install xlsxwriter
```

---

## Menu Structure

After installation, accounting users will see a new **FinanceHub** menu under **Accounting**:

```
Accounting
└── FinanceHub
    ├── Dashboard          (financehub_dashboard)
    ├── Reports            (financehub_reports)
    ├── Saved Reports      (financehub_saved_reports)
    ├── Custom Report Builder  (financehub_report_builder)
    └── Bank Reconciliation    (financehub_reconciliation)
```

---

## Architecture

```
financehub_frontend/
├── __manifest__.py            Module metadata + asset bundle
├── __init__.py
├── models/
│   ├── financehub_saved_config.py        Saved filter configurations
│   ├── financehub_report_definition.py   Custom report spec storage
│   └── financehub_reconciliation_note.py Reconciliation audit trail
├── controllers/
│   ├── reports.py        /financehub/reports/* HTTP endpoints
│   └── reconciliation.py /financehub/bank/* + /financehub/dashboard/kpis
├── security/
│   ├── financehub_security.xml  ir.rule definitions
│   └── ir.model.access.csv
├── views/
│   ├── financehub_actions.xml   ir.actions.client entries
│   └── financehub_menus.xml     Menu items
└── static/src/
    ├── scss/financehub.scss     All styles (BEM-ish, fh- prefix)
    ├── js/
    │   ├── services/financehub_service.js   Central HTTP/ORM wrapper
    │   ├── actions/                          OWL client action roots
    │   │   ├── dashboard_action.js
    │   │   ├── reports_action.js
    │   │   ├── saved_reports_action.js
    │   │   ├── report_builder_action.js
    │   │   └── reconciliation_action.js
    │   └── components/                       Reusable OWL components
    │       ├── filter_bar.js
    │       ├── report_table.js
    │       ├── drilldown_drawer.js
    │       ├── saved_config_modal.js
    │       ├── export_buttons.js
    │       ├── builder_filters.js
    │       ├── builder_columns.js
    │       ├── builder_grouping.js
    │       ├── builder_preview.js
    │       ├── reconciliation_workbench.js
    │       ├── statement_lines_list.js
    │       └── match_candidates_panel.js
    └── xml/                                  QWeb templates
        ├── components.xml   (FilterBar, ReportTable, DrilldownDrawer, …)
        ├── dashboard.xml
        ├── reports.xml
        ├── saved_reports.xml
        ├── report_builder.xml
        └── reconciliation.xml
```

---

## API Contract

All routes are under `/financehub/` and return `{ "status": "ok", "data": ... }` or `{ "status": "error", "message": "..." }`.

### Reporting

| Method | Route | Description |
|--------|-------|-------------|
| GET  | `/financehub/reports/types` | List all report types + capabilities |
| POST | `/financehub/reports/run` | Run a report with filter payload |
| POST | `/financehub/reports/drilldown` | Paginated journal items for a row |
| POST | `/financehub/reports/export_pdf` | Download PDF |
| POST | `/financehub/reports/export_xlsx` | Download XLSX |

#### `report_run` payload

```json
{
  "report_type": "profit_loss",
  "filters": {
    "date_from": "2025-01-01",
    "date_to":   "2025-12-31",
    "company_ids": [1],
    "journal_ids": [],
    "analytic_ids": [],
    "partner_ids": [],
    "compare_mode": null
  }
}
```

#### `report_run` response

```json
{
  "status": "ok",
  "data": {
    "title": "Profit & Loss",
    "report_type": "profit_loss",
    "date_from": "2025-01-01",
    "date_to":   "2025-12-31",
    "currency": "USD",
    "columns": [
      { "field": "label",   "label": "Account",           "type": "text" },
      { "field": "balance", "label": "2025-01-01 – …",    "type": "monetary" }
    ],
    "rows": [
      {
        "row_key":    "section:income",
        "label":      "INCOME",
        "is_section": true,
        "values":     { "balance": 250000 },
        "expandable": true,
        "children": [
          {
            "row_key":  "account:42",
            "label":    "4000 Product Sales",
            "values":   { "balance": 200000 },
            "expandable": true,
            "children": []
          }
        ]
      }
    ],
    "totals": {
      "label":  "Net Profit / (Loss)",
      "values": { "balance": 75000 }
    }
  }
}
```

### Bank Reconciliation

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/financehub/bank/statement_lines` | Paginated list with filters |
| POST | `/financehub/bank/match_suggestions` | Auto-suggest matches for a line |
| POST | `/financehub/bank/reconcile` | Apply match/split/write-off/payment/review |
| POST | `/financehub/bank/audit_log` | Full audit trail for a line |

#### `reconcile` action payloads

```jsonc
// Match to existing payment or move line
{ "action": "match",          "line_id": 1, "match_type": "payment", "match_id": 5 }
{ "action": "match",          "line_id": 1, "match_type": "move_line", "match_id": 99 }

// Write-off
{ "action": "writeoff",       "line_id": 1, "account_id": 120, "amount": 15.00, "label": "Bank charge" }

// Split line
{ "action": "split",          "line_id": 1, "parts": [{"amount": 100, "label": "Rent"}, {"amount": 50, "label": "Utilities"}] }

// Create payment and reconcile
{ "action": "create_payment", "line_id": 1, "partner_id": 3, "memo": "Invoice #INV001", "amount": 500 }

// Mark for review
{ "action": "mark_review",    "line_id": 1, "note": "Needs clarification" }
```

---

## Extending with New Reports

### 1. Add a standard report type

In `controllers/reports.py`, add an entry to `REPORT_REGISTRY` and implement a builder method:

```python
REPORT_REGISTRY['my_report'] = {
    'label': 'My Custom Standard Report',
    'icon': 'fa-star',
    'supports_compare': False,
    'supports_drilldown': True,
    'supports_analytic': True,
    'date_mode': 'range',
}

def _build_my_report(self, filters):
    # ... query account.move.line, build rows, return structured data
    return { 'title': 'My Custom Standard Report', ... }
```

Register the builder in `_run_standard_report`'s `builders` dict.

### 2. Add via the no-code Report Builder

No Python required. Go to **FinanceHub → Custom Report Builder**, create a new definition, pick your model, add filters, columns, and grouping, then save and run.

### 3. Extend available fields for the builder

In `builder_filters.js` / `builder_columns.js`, extend the `MODEL_FIELDS` constant:

```js
MODEL_FIELDS['account.move.line'].push(
    { name: 'my_custom_field', string: 'My Field', ttype: 'char' }
);
```

---

## Security Notes

- All backend routes call `_require_accounting()` / `_require_reconciliation()` before processing.
- Record rules enforce: owners can edit their own configs; shared configs are read-only for non-owners; managers bypass all restrictions.
- `create_payment` action requires `account.group_account_manager`.
- Multi-company context is enforced via `company_id` filters on all queries.

---

## Development Tips

### Running in development

```bash
odoo-bin -c odoo.conf -u financehub_frontend --dev=xml,reload
```

The `--dev=xml,reload` flags auto-reload assets on change.

### Debugging OWL components

Open browser console; all FinanceHub errors are prefixed. The service `financehub` is available in the OWL debug tree.

### SCSS compilation

The SCSS is included directly in the Odoo asset bundle and compiled by Odoo's built-in sass processor (libsass). No separate build step needed.

---

## License

LGPL-3 — see https://www.gnu.org/licenses/lgpl-3.0.html
