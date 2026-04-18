# -*- coding: utf-8 -*-
"""
FinanceHub – Reporting Controller
===================================
Provides JSON endpoints for the OWL reporting UI.

All routes live under /financehub/reports/.
Access is checked per-call against the standard accounting groups.

Design principle: keep Odoo ORM queries here; the OWL client is a pure
renderer that relies on well-typed payloads.
"""

import json
import logging
import io
from datetime import date, datetime, timedelta

from odoo import http, fields, _
from odoo.http import request, content_disposition
from odoo.exceptions import AccessError, UserError
from odoo.tools import date_utils

_logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

ACCOUNTING_GROUPS = [
    'account.group_account_user',
    'account.group_account_manager',
]


def _require_accounting(user=None):
    user = user or request.env.user
    if not any(user.has_group(g) for g in ACCOUNTING_GROUPS):
        raise AccessError(_("FinanceHub: accounting access required."))


def _json_ok(data):
    return request.make_json_response({'status': 'ok', 'data': data})


def _json_err(msg, code=400):
    return request.make_json_response(
        {'status': 'error', 'message': str(msg)}, status=code
    )


def _parse_body():
    """Parse the JSON request body and return a dict."""
    try:
        return json.loads(request.httprequest.data or b'{}')
    except (TypeError, ValueError) as exc:
        raise UserError(_("Invalid JSON request body: %s", exc))


# ─────────────────────────────────────────────────────────────────────────────
# Report-type registry
# ─────────────────────────────────────────────────────────────────────────────

REPORT_REGISTRY = {
    'balance_sheet': {
        'label': 'Balance Sheet',
        'icon': 'fa-balance-scale',
        'supports_compare': True,
        'supports_drilldown': True,
        'supports_analytic': False,
        'date_mode': 'to_date',
    },
    'profit_loss': {
        'label': 'Profit & Loss',
        'icon': 'fa-line-chart',
        'supports_compare': True,
        'supports_drilldown': True,
        'supports_analytic': True,
        'date_mode': 'range',
    },
    'cash_flow': {
        'label': 'Cash Flow',
        'icon': 'fa-exchange',
        'supports_compare': True,
        'supports_drilldown': True,
        'supports_analytic': False,
        'date_mode': 'range',
    },
    'trial_balance': {
        'label': 'Trial Balance',
        'icon': 'fa-table',
        'supports_compare': True,
        'supports_drilldown': True,
        'supports_analytic': True,
        'date_mode': 'range',
    },
    'general_ledger': {
        'label': 'General Ledger',
        'icon': 'fa-book',
        'supports_compare': False,
        'supports_drilldown': True,
        'supports_analytic': True,
        'date_mode': 'range',
    },
    'aged_receivable': {
        'label': 'Aged Receivable',
        'icon': 'fa-clock-o',
        'supports_compare': False,
        'supports_drilldown': True,
        'supports_analytic': False,
        'date_mode': 'to_date',
    },
    'aged_payable': {
        'label': 'Aged Payable',
        'icon': 'fa-clock-o',
        'supports_compare': False,
        'supports_drilldown': True,
        'supports_analytic': False,
        'date_mode': 'to_date',
    },
    'journal_report': {
        'label': 'Journal Report',
        'icon': 'fa-newspaper-o',
        'supports_compare': False,
        'supports_drilldown': True,
        'supports_analytic': False,
        'date_mode': 'range',
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# Controller
# ─────────────────────────────────────────────────────────────────────────────

class FinancehubReportsController(http.Controller):

    # ── Report types list ─────────────────────────────────────────────────────

    @http.route('/financehub/reports/types', type='http', auth='user',
                methods=['GET'], csrf=False)
    def report_types(self):
        _require_accounting()
        # Add custom report definitions
        custom_defs = request.env['financehub.report.definition'].list_definitions()
        result = [
            {'id': k, **v} for k, v in REPORT_REGISTRY.items()
        ]
        for cd in custom_defs:
            result.append({
                'id': f"custom_{cd['id']}",
                'label': cd['name'],
                'icon': cd.get('icon', 'fa-cog'),
                'is_custom': True,
                'definition_id': cd['id'],
                'supports_compare': False,
                'supports_drilldown': True,
                'supports_analytic': True,
                'date_mode': 'range',
            })
        return _json_ok(result)

    # ── Run report ────────────────────────────────────────────────────────────

    @http.route('/financehub/reports/run', type='http', auth='user',
                methods=['POST'], csrf=False)
    def report_run(self):
        _require_accounting()
        payload = _parse_body()
        report_type = payload.get('report_type', '')
        filters = payload.get('filters', {})

        try:
            if report_type.startswith('custom_'):
                def_id = int(report_type.split('_', 1)[1])
                data = self._run_custom_report(def_id, filters)
            elif report_type in REPORT_REGISTRY:
                data = self._run_standard_report(report_type, filters)
            else:
                return _json_err(f"Unknown report type: {report_type}")
        except Exception as exc:
            _logger.exception("FinanceHub report_run error")
            return _json_err(str(exc))

        return _json_ok(data)

    # ── Drilldown ─────────────────────────────────────────────────────────────

    @http.route('/financehub/reports/drilldown', type='http', auth='user',
                methods=['POST'], csrf=False)
    def report_drilldown(self):
        _require_accounting()
        payload = _parse_body()
        row_key = payload.get('row_key')
        filters = payload.get('filters', {})
        page = int(payload.get('page', 1))
        page_size = int(payload.get('page_size', 50))

        if not row_key:
            return _json_err("row_key is required")

        domain = self._build_drilldown_domain(row_key, filters)
        MLine = request.env['account.move.line']
        total = MLine.search_count(domain)
        lines = MLine.search(
            domain,
            limit=page_size,
            offset=(page - 1) * page_size,
            order='date asc, id asc',
        )
        rows = []
        for ln in lines:
            rows.append({
                'id': ln.id,
                'date': ln.date.isoformat() if ln.date else None,
                'journal': ln.journal_id.name,
                'account_code': ln.account_id.code,
                'account_name': ln.account_id.name,
                'partner': ln.partner_id.name or '',
                'ref': ln.ref or ln.move_id.name,
                'label': ln.name or '',
                'debit': ln.debit,
                'credit': ln.credit,
                'balance': ln.balance,
                'currency': ln.currency_id.name if ln.currency_id else '',
                'move_id': ln.move_id.id,
                'move_name': ln.move_id.name,
                'analytic': [t.name for t in ln.analytic_distribution and
                             request.env['account.analytic.account'].browse(
                                 [int(k) for k in (ln.analytic_distribution or {})]) or []],
            })
        return _json_ok({
            'rows': rows,
            'total': total,
            'page': page,
            'page_size': page_size,
            'pages': (total + page_size - 1) // page_size,
        })

    # ── Export PDF ────────────────────────────────────────────────────────────

    @http.route('/financehub/reports/export_pdf', type='http', auth='user',
                methods=['POST'], csrf=False)
    def export_pdf(self):
        _require_accounting()
        payload = _parse_body()
        # Delegate to Odoo's built-in report engine where possible; otherwise
        # fall back to a simple HTML-to-PDF render.
        report_type = payload.get('report_type', '')
        filters = payload.get('filters', {})

        # Build the report data first
        if report_type in REPORT_REGISTRY:
            data = self._run_standard_report(report_type, filters)
        else:
            return _json_err("PDF export not supported for custom reports yet.")

        # Render using wkhtmltopdf via Odoo's report.action mechanism
        # We use the ir.actions.report _render_qweb_pdf pattern
        html_content = self._render_report_html(report_type, data, filters)
        pdf_content, _ = request.env['ir.actions.report']._run_wkhtmltopdf(
            [html_content],
            header=b'', footer=b'',
            landscape=False,
            specific_paperformat_args={},
            set_viewport_size=False,
        )
        filename = f"financehub_{report_type}_{date.today().isoformat()}.pdf"
        return request.make_response(
            pdf_content,
            headers=[
                ('Content-Type', 'application/pdf'),
                ('Content-Disposition', content_disposition(filename)),
            ],
        )

    # ── Export XLSX ───────────────────────────────────────────────────────────

    @http.route('/financehub/reports/export_xlsx', type='http', auth='user',
                methods=['POST'], csrf=False)
    def export_xlsx(self):
        _require_accounting()
        payload = _parse_body()
        report_type = payload.get('report_type', '')
        filters = payload.get('filters', {})

        if report_type in REPORT_REGISTRY:
            data = self._run_standard_report(report_type, filters)
        elif report_type.startswith('custom_'):
            def_id = int(report_type.split('_', 1)[1])
            data = self._run_custom_report(def_id, filters)
        else:
            return _json_err("Unknown report type")

        try:
            import xlsxwriter
        except ImportError:
            return _json_err("xlsxwriter is not installed.")

        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet(data.get('title', 'Report')[:31])

        # Formats
        bold = workbook.add_format({'bold': True})
        money = workbook.add_format({'num_format': '#,##0.00'})
        header_fmt = workbook.add_format({'bold': True, 'bg_color': '#1F4E79', 'font_color': '#FFFFFF'})

        # Write header
        columns = data.get('columns', [])
        for col_idx, col in enumerate(columns):
            worksheet.write(0, col_idx, col.get('label', ''), header_fmt)

        # Write rows (flatten tree)
        row_idx = 1
        def write_rows(rows, indent=0):
            nonlocal row_idx
            for row in rows:
                for col_idx, col in enumerate(columns):
                    val = row.get('values', {}).get(col['field'])
                    cell_fmt = money if col.get('type') == 'monetary' else None
                    prefix = '  ' * indent if col_idx == 0 else ''
                    if isinstance(val, (int, float)):
                        worksheet.write_number(row_idx, col_idx, val, cell_fmt)
                    else:
                        worksheet.write(row_idx, col_idx, f"{prefix}{val or ''}")
                row_idx += 1
                if row.get('children'):
                    write_rows(row['children'], indent + 1)

        write_rows(data.get('rows', []))
        workbook.close()

        filename = f"financehub_{report_type}_{date.today().isoformat()}.xlsx"
        return request.make_response(
            output.getvalue(),
            headers=[
                ('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
                ('Content-Disposition', content_disposition(filename)),
            ],
        )

    # ─────────────────────────────────────────────────────────────────────────
    # Internal helpers
    # ─────────────────────────────────────────────────────────────────────────

    def _build_filter_domain(self, filters):
        """Convert OWL filter payload to account.move.line domain."""
        domain = [('move_id.state', '=', 'posted')]

        date_from = filters.get('date_from')
        date_to = filters.get('date_to')
        if date_from:
            domain += [('date', '>=', date_from)]
        if date_to:
            domain += [('date', '<=', date_to)]

        company_ids = filters.get('company_ids', [])
        if company_ids:
            domain += [('company_id', 'in', company_ids)]
        else:
            domain += [('company_id', '=', request.env.company.id)]

        journal_ids = filters.get('journal_ids', [])
        if journal_ids:
            domain += [('journal_id', 'in', journal_ids)]

        partner_ids = filters.get('partner_ids', [])
        if partner_ids:
            domain += [('partner_id', 'in', partner_ids)]

        account_ids = filters.get('account_ids', [])
        if account_ids:
            domain += [('account_id', 'in', account_ids)]

        analytic_ids = filters.get('analytic_ids', [])
        if analytic_ids:
            # analytic_distribution is a JSON field; use contains
            for aid in analytic_ids:
                domain += [('analytic_distribution', 'like', str(aid))]

        return domain

    def _build_drilldown_domain(self, row_key, filters):
        """Parse a row_key and merge with filters to produce a drilldown domain."""
        base_domain = self._build_filter_domain(filters)
        # row_key format: "account:{account_id}" | "partner:{partner_id}" | "journal:{journal_id}"
        parts = row_key.split(':', 1) if ':' in row_key else [row_key, '']
        key_type, key_val = parts[0], parts[1]

        if key_type == 'account' and key_val.isdigit():
            base_domain += [('account_id', '=', int(key_val))]
        elif key_type == 'partner' and key_val.isdigit():
            base_domain += [('partner_id', '=', int(key_val))]
        elif key_type == 'journal' and key_val.isdigit():
            base_domain += [('journal_id', '=', int(key_val))]
        # Additional key types can be added here

        return base_domain

    def _run_standard_report(self, report_type, filters):
        """Run one of the standard report types and return structured data."""
        env = request.env
        company = env.company

        # Dispatch to per-report builder
        builders = {
            'balance_sheet': self._build_balance_sheet,
            'profit_loss': self._build_profit_loss,
            'cash_flow': self._build_cash_flow,
            'trial_balance': self._build_trial_balance,
            'general_ledger': self._build_general_ledger,
            'aged_receivable': lambda f: self._build_aged(f, receivable=True),
            'aged_payable': lambda f: self._build_aged(f, receivable=False),
            'journal_report': self._build_journal_report,
        }
        builder = builders.get(report_type)
        if not builder:
            raise UserError(f"No builder for report type: {report_type}")
        return builder(filters)

    # ── Balance Sheet ─────────────────────────────────────────────────────────

    def _build_balance_sheet(self, filters):
        env = request.env
        company = env.company
        date_to = filters.get('date_to') or fields.Date.today().isoformat()
        domain_base = [
            ('move_id.state', '=', 'posted'),
            ('date', '<=', date_to),
            ('company_id', '=', company.id),
        ]
        journal_ids = filters.get('journal_ids', [])
        if journal_ids:
            domain_base += [('journal_id', 'in', journal_ids)]

        account_types = {
            'assets': ['asset_receivable', 'asset_cash', 'asset_current',
                       'asset_non_current', 'asset_prepayments', 'asset_fixed'],
            'liabilities': ['liability_payable', 'liability_credit_card',
                            'liability_current', 'liability_non_current'],
            'equity': ['equity', 'equity_unaffected'],
        }

        def _sum_by_type(types):
            rows = []
            total_balance = 0.0
            for atype in types:
                lines = env['account.move.line'].read_group(
                    domain_base + [('account_id.account_type', '=', atype)],
                    ['account_id', 'balance:sum'],
                    ['account_id'],
                    orderby='account_id asc',
                )
                for ln in lines:
                    acc = env['account.account'].browse(ln['account_id'][0])
                    balance = ln.get('balance', 0.0) or 0.0
                    rows.append({
                        'row_key': f"account:{acc.id}",
                        'label': f"{acc.code} {acc.name}",
                        'account_type': atype,
                        'values': {
                            'balance': balance,
                        },
                        'expandable': True,
                        'children': [],
                    })
                    total_balance += balance
            return rows, total_balance

        asset_rows, asset_total = _sum_by_type(account_types['assets'])
        liab_rows, liab_total = _sum_by_type(account_types['liabilities'])
        equity_rows, equity_total = _sum_by_type(account_types['equity'])

        return {
            'title': 'Balance Sheet',
            'report_type': 'balance_sheet',
            'as_of': date_to,
            'currency': company.currency_id.name,
            'columns': [
                {'field': 'label', 'label': 'Account', 'type': 'text'},
                {'field': 'balance', 'label': f'Balance ({date_to})', 'type': 'monetary'},
            ],
            'rows': [
                {
                    'row_key': 'section:assets',
                    'label': 'ASSETS',
                    'is_section': True,
                    'values': {'balance': asset_total},
                    'expandable': True,
                    'children': asset_rows,
                },
                {
                    'row_key': 'section:liabilities',
                    'label': 'LIABILITIES',
                    'is_section': True,
                    'values': {'balance': liab_total},
                    'expandable': True,
                    'children': liab_rows,
                },
                {
                    'row_key': 'section:equity',
                    'label': 'EQUITY',
                    'is_section': True,
                    'values': {'balance': equity_total},
                    'expandable': True,
                    'children': equity_rows,
                },
            ],
            'totals': {
                'label': 'Total Liabilities + Equity',
                'values': {'balance': liab_total + equity_total},
            },
        }

    # ── Profit & Loss ─────────────────────────────────────────────────────────

    def _build_profit_loss(self, filters):
        env = request.env
        company = env.company
        date_from = filters.get('date_from') or date(date.today().year, 1, 1).isoformat()
        date_to = filters.get('date_to') or fields.Date.today().isoformat()
        domain_base = [
            ('move_id.state', '=', 'posted'),
            ('date', '>=', date_from),
            ('date', '<=', date_to),
            ('company_id', '=', company.id),
        ]
        journal_ids = filters.get('journal_ids', [])
        if journal_ids:
            domain_base += [('journal_id', 'in', journal_ids)]

        def _get_section(account_types, section_label):
            rows = []
            total = 0.0
            for atype in account_types:
                lines = env['account.move.line'].read_group(
                    domain_base + [('account_id.account_type', '=', atype)],
                    ['account_id', 'balance:sum'],
                    ['account_id'],
                    orderby='account_id asc',
                )
                for ln in lines:
                    acc = env['account.account'].browse(ln['account_id'][0])
                    balance = -(ln.get('balance', 0.0) or 0.0)  # income is negative balance
                    rows.append({
                        'row_key': f"account:{acc.id}",
                        'label': f"{acc.code} {acc.name}",
                        'values': {'balance': balance},
                        'expandable': True,
                        'children': [],
                    })
                    total += balance
            return rows, total

        income_rows, income_total = _get_section(['income', 'income_other'], 'Income')
        expense_rows, expense_total = _get_section(['expense', 'expense_depreciation', 'expense_direct_cost'], 'Expenses')
        net_profit = income_total - expense_total

        return {
            'title': 'Profit & Loss',
            'report_type': 'profit_loss',
            'date_from': date_from,
            'date_to': date_to,
            'currency': company.currency_id.name,
            'columns': [
                {'field': 'label', 'label': 'Account', 'type': 'text'},
                {'field': 'balance', 'label': f'{date_from} – {date_to}', 'type': 'monetary'},
            ],
            'rows': [
                {
                    'row_key': 'section:income',
                    'label': 'INCOME',
                    'is_section': True,
                    'values': {'balance': income_total},
                    'expandable': True,
                    'children': income_rows,
                },
                {
                    'row_key': 'section:expenses',
                    'label': 'EXPENSES',
                    'is_section': True,
                    'values': {'balance': expense_total},
                    'expandable': True,
                    'children': expense_rows,
                },
            ],
            'totals': {
                'label': 'Net Profit / (Loss)',
                'values': {'balance': net_profit},
            },
        }

    # ── Cash Flow (simplified indirect method) ───────────────────────────────

    def _build_cash_flow(self, filters):
        env = request.env
        company = env.company
        date_from = filters.get('date_from') or date(date.today().year, 1, 1).isoformat()
        date_to = filters.get('date_to') or fields.Date.today().isoformat()
        domain_base = [
            ('move_id.state', '=', 'posted'),
            ('date', '>=', date_from),
            ('date', '<=', date_to),
            ('company_id', '=', company.id),
            ('account_id.account_type', 'in', ['asset_cash']),
        ]
        cash_lines = env['account.move.line'].search(domain_base)
        inflows = sum(l.debit for l in cash_lines)
        outflows = sum(l.credit for l in cash_lines)
        net = inflows - outflows
        return {
            'title': 'Cash Flow',
            'report_type': 'cash_flow',
            'date_from': date_from,
            'date_to': date_to,
            'currency': company.currency_id.name,
            'columns': [
                {'field': 'label', 'label': 'Activity', 'type': 'text'},
                {'field': 'inflow', 'label': 'Inflows', 'type': 'monetary'},
                {'field': 'outflow', 'label': 'Outflows', 'type': 'monetary'},
                {'field': 'net', 'label': 'Net', 'type': 'monetary'},
            ],
            'rows': [
                {
                    'row_key': 'section:cash',
                    'label': 'Cash & Cash Equivalents',
                    'is_section': False,
                    'values': {'inflow': inflows, 'outflow': outflows, 'net': net},
                    'expandable': True,
                    'children': [],
                },
            ],
            'totals': {
                'label': 'Net Change in Cash',
                'values': {'inflow': inflows, 'outflow': outflows, 'net': net},
            },
        }

    # ── Trial Balance ─────────────────────────────────────────────────────────

    # Account type → section ordering and label (Community-only account_type values)
    _TB_SECTIONS = [
        ('assets',      ['asset_receivable', 'asset_cash', 'asset_current',
                         'asset_non_current', 'asset_prepayments', 'asset_fixed'],      'Assets'),
        ('liabilities', ['liability_payable', 'liability_credit_card',
                         'liability_current', 'liability_non_current'],                 'Liabilities'),
        ('equity',      ['equity', 'equity_unaffected'],                                'Equity'),
        ('income',      ['income', 'income_other'],                                     'Income'),
        ('expenses',    ['expense', 'expense_depreciation', 'expense_direct_cost'],     'Expenses'),
    ]

    def _build_trial_balance(self, filters):
        env = request.env
        company = env.company
        date_from = filters.get('date_from') or date(date.today().year, 1, 1).isoformat()
        date_to   = filters.get('date_to')   or fields.Date.today().isoformat()
        hide_zero = filters.get('hide_zero', True)

        # Common domain fragments (no date filter yet)
        domain_common = [
            ('move_id.state', '=', 'posted'),
            ('company_id', '=', company.id),
        ]
        journal_ids = filters.get('journal_ids', [])
        if journal_ids:
            domain_common += [('journal_id', 'in', journal_ids)]
        partner_ids = filters.get('partner_ids', [])
        if partner_ids:
            domain_common += [('partner_id', 'in', partner_ids)]

        def _read_balances(extra_domain):
            return {
                row['account_id'][0]: {
                    'debit':   row.get('debit',   0.0) or 0.0,
                    'credit':  row.get('credit',  0.0) or 0.0,
                    'balance': row.get('balance', 0.0) or 0.0,
                }
                for row in env['account.move.line'].read_group(
                    domain_common + extra_domain,
                    ['account_id', 'debit:sum', 'credit:sum', 'balance:sum'],
                    ['account_id'],
                )
            }

        # Opening balances: all posted lines strictly before date_from
        opening_map = _read_balances([('date', '<', date_from)])
        # Period movements: lines within [date_from, date_to]
        period_map  = _read_balances([('date', '>=', date_from), ('date', '<=', date_to)])

        all_acc_ids = set(opening_map) | set(period_map)
        if not all_acc_ids:
            return {
                'title': 'Trial Balance',
                'report_type': 'trial_balance',
                'date_from': date_from,
                'date_to': date_to,
                'currency': company.currency_id.name,
                'columns': self._tb_columns(date_from, date_to),
                'rows': [],
                'totals': None,
                'sections_meta': [],
            }

        accounts = env['account.account'].search(
            [('id', 'in', list(all_acc_ids)), ('company_id', '=', company.id)],
            order='code asc',
        )
        # Map account_type → section key for quick lookup
        type_to_section = {}
        for sec_key, types, _label in self._TB_SECTIONS:
            for t in types:
                type_to_section[t] = sec_key

        # Build per-account rows bucketed by section
        section_rows   = {s[0]: [] for s in self._TB_SECTIONS}
        section_rows['other'] = []
        section_totals = {}

        grand = dict(ob_dr=0.0, ob_cr=0.0, pd_dr=0.0, pd_cr=0.0, cb_dr=0.0, cb_cr=0.0)

        for acc in accounts:
            ob = opening_map.get(acc.id, {'debit': 0.0, 'credit': 0.0, 'balance': 0.0})
            pd = period_map.get(acc.id,  {'debit': 0.0, 'credit': 0.0, 'balance': 0.0})

            ob_bal = ob['balance']
            cb_bal = ob_bal + pd['balance']

            # Express balances as signed Dr / Cr pairs
            ob_dr = ob_bal if ob_bal > 0 else 0.0
            ob_cr = (-ob_bal) if ob_bal < 0 else 0.0
            cb_dr = cb_bal if cb_bal > 0 else 0.0
            cb_cr = (-cb_bal) if cb_bal < 0 else 0.0

            if hide_zero and ob_dr == 0 and ob_cr == 0 and pd['debit'] == 0 and pd['credit'] == 0 and cb_dr == 0 and cb_cr == 0:
                continue

            row = {
                'row_key':      f"account:{acc.id}",
                'label':        f"{acc.code}  {acc.name}",
                'account_type': acc.account_type,
                'values': {
                    'ob_debit':  ob_dr,
                    'ob_credit': ob_cr,
                    'pd_debit':  pd['debit'],
                    'pd_credit': pd['credit'],
                    'cb_debit':  cb_dr,
                    'cb_credit': cb_cr,
                },
                'expandable': True,
                'children': [],
            }
            sec_key = type_to_section.get(acc.account_type, 'other')
            section_rows[sec_key].append(row)

            for k, v in [('ob_dr', ob_dr), ('ob_cr', ob_cr),
                         ('pd_dr', pd['debit']), ('pd_cr', pd['credit']),
                         ('cb_dr', cb_dr), ('cb_cr', cb_cr)]:
                grand[k] += v

        # Build top-level section rows
        rows = []
        sections_meta = []
        all_sections = list(self._TB_SECTIONS) + [('other', [], 'Other')]
        for sec_key, _types, sec_label in all_sections:
            child_rows = section_rows.get(sec_key, [])
            if not child_rows:
                continue
            stot = {k: sum(r['values'][k] for r in child_rows)
                    for k in ('ob_debit', 'ob_credit', 'pd_debit', 'pd_credit', 'cb_debit', 'cb_credit')}
            section_row = {
                'row_key':    f"section:{sec_key}",
                'label':      sec_label.upper(),
                'is_section': True,
                'values':     stot,
                'expandable': True,
                'children':   child_rows,
            }
            rows.append(section_row)
            sections_meta.append({'key': sec_key, 'label': sec_label})

        return {
            'title':         'Trial Balance',
            'report_type':   'trial_balance',
            'date_from':     date_from,
            'date_to':       date_to,
            'currency':      company.currency_id.name,
            'columns':       self._tb_columns(date_from, date_to),
            'rows':          rows,
            'totals': {
                'label': 'Grand Total',
                'values': {
                    'ob_debit':  grand['ob_dr'],
                    'ob_credit': grand['ob_cr'],
                    'pd_debit':  grand['pd_dr'],
                    'pd_credit': grand['pd_cr'],
                    'cb_debit':  grand['cb_dr'],
                    'cb_credit': grand['cb_cr'],
                },
            },
            'sections_meta': sections_meta,
        }

    def _tb_columns(self, date_from, date_to):
        return [
            {'field': 'label',     'label': 'Account',        'type': 'text'},
            {'field': 'ob_debit',  'label': 'Opening Dr',      'type': 'monetary'},
            {'field': 'ob_credit', 'label': 'Opening Cr',      'type': 'monetary'},
            {'field': 'pd_debit',  'label': 'Period Dr',       'type': 'monetary'},
            {'field': 'pd_credit', 'label': 'Period Cr',       'type': 'monetary'},
            {'field': 'cb_debit',  'label': 'Closing Dr',      'type': 'monetary'},
            {'field': 'cb_credit', 'label': 'Closing Cr',      'type': 'monetary'},
        ]

    # ── General Ledger ────────────────────────────────────────────────────────

    def _build_general_ledger(self, filters):
        env = request.env
        company = env.company
        date_from = filters.get('date_from') or date(date.today().year, 1, 1).isoformat()
        date_to = filters.get('date_to') or fields.Date.today().isoformat()
        account_ids = filters.get('account_ids', [])
        domain_base = [
            ('move_id.state', '=', 'posted'),
            ('date', '>=', date_from),
            ('date', '<=', date_to),
            ('company_id', '=', company.id),
        ]
        if account_ids:
            domain_base += [('account_id', 'in', account_ids)]
        journal_ids = filters.get('journal_ids', [])
        if journal_ids:
            domain_base += [('journal_id', 'in', journal_ids)]

        # Group by account first
        account_groups = env['account.move.line'].read_group(
            domain_base, ['account_id'], ['account_id'], orderby='account_id asc'
        )
        rows = []
        for ag in account_groups:
            acc = env['account.account'].browse(ag['account_id'][0])
            lines = env['account.move.line'].search(
                domain_base + [('account_id', '=', acc.id)],
                order='date asc, id asc',
                limit=200,
            )
            children = [{
                'row_key': f"account:{acc.id}:move_line:{ln.id}",
                'label': f"{ln.move_id.name} – {ln.name or ''}",
                'values': {
                    'date': ln.date.isoformat() if ln.date else '',
                    'debit': ln.debit,
                    'credit': ln.credit,
                    'balance': ln.balance,
                },
                'expandable': False,
                'children': [],
            } for ln in lines]
            rows.append({
                'row_key': f"account:{acc.id}",
                'label': f"{acc.code} {acc.name}",
                'is_section': True,
                'values': {
                    'date': '',
                    'debit': sum(c['values']['debit'] for c in children),
                    'credit': sum(c['values']['credit'] for c in children),
                    'balance': sum(c['values']['balance'] for c in children),
                },
                'expandable': True,
                'children': children,
            })
        return {
            'title': 'General Ledger',
            'report_type': 'general_ledger',
            'date_from': date_from,
            'date_to': date_to,
            'currency': company.currency_id.name,
            'columns': [
                {'field': 'label', 'label': 'Account / Entry', 'type': 'text'},
                {'field': 'date', 'label': 'Date', 'type': 'date'},
                {'field': 'debit', 'label': 'Debit', 'type': 'monetary'},
                {'field': 'credit', 'label': 'Credit', 'type': 'monetary'},
                {'field': 'balance', 'label': 'Balance', 'type': 'monetary'},
            ],
            'rows': rows,
            'totals': {},
        }

    # ── Aged Receivable / Payable ─────────────────────────────────────────────

    def _build_aged(self, filters, receivable=True):
        env = request.env
        company = env.company
        date_to_str = filters.get('date_to') or fields.Date.today().isoformat()
        date_to = date.fromisoformat(date_to_str)
        atype = 'asset_receivable' if receivable else 'liability_payable'
        title = 'Aged Receivable' if receivable else 'Aged Payable'

        # Buckets: current, 0-30, 31-60, 61-90, 91-120, >120
        buckets = [0, 30, 60, 90, 120]

        domain = [
            ('move_id.state', '=', 'posted'),
            ('account_id.account_type', '=', atype),
            ('company_id', '=', company.id),
            ('reconciled', '=', False),
        ]
        partner_ids = filters.get('partner_ids', [])
        if partner_ids:
            domain += [('partner_id', 'in', partner_ids)]

        lines = env['account.move.line'].search(domain)
        partner_map = {}
        for ln in lines:
            pid = ln.partner_id.id or 0
            pname = ln.partner_id.name or 'Unknown'
            if pid not in partner_map:
                partner_map[pid] = {'partner': pname, 'buckets': [0.0] * (len(buckets) + 1)}
            due = ln.date_maturity or ln.date
            days_overdue = (date_to - due).days if due else 0
            bal = ln.amount_residual
            idx = len(buckets)
            for i, b in enumerate(buckets):
                if days_overdue <= b:
                    idx = i
                    break
            partner_map[pid]['buckets'][idx] += bal

        rows = []
        bucket_labels = ['Current', '1-30 days', '31-60 days', '61-90 days', '91-120 days', '>120 days']
        totals = [0.0] * (len(buckets) + 1)
        for pid, pdata in partner_map.items():
            row_values = {'partner': pdata['partner']}
            for i, lbl in enumerate(bucket_labels):
                row_values[f'bucket_{i}'] = pdata['buckets'][i]
                totals[i] += pdata['buckets'][i]
            rows.append({
                'row_key': f"partner:{pid}",
                'label': pdata['partner'],
                'values': row_values,
                'expandable': True,
                'children': [],
            })

        columns = [{'field': 'label', 'label': 'Partner', 'type': 'text'}]
        for i, lbl in enumerate(bucket_labels):
            columns.append({'field': f'bucket_{i}', 'label': lbl, 'type': 'monetary'})

        return {
            'title': title,
            'report_type': 'aged_receivable' if receivable else 'aged_payable',
            'as_of': date_to_str,
            'currency': company.currency_id.name,
            'columns': columns,
            'rows': rows,
            'totals': {
                'label': 'Total',
                'values': {f'bucket_{i}': totals[i] for i in range(len(bucket_labels))},
            },
        }

    # ── Journal Report ────────────────────────────────────────────────────────

    def _build_journal_report(self, filters):
        env = request.env
        company = env.company
        date_from = filters.get('date_from') or date(date.today().year, 1, 1).isoformat()
        date_to = filters.get('date_to') or fields.Date.today().isoformat()
        journal_ids = filters.get('journal_ids', [])
        domain_base = [
            ('move_id.state', '=', 'posted'),
            ('date', '>=', date_from),
            ('date', '<=', date_to),
            ('company_id', '=', company.id),
        ]
        if journal_ids:
            domain_base += [('journal_id', 'in', journal_ids)]

        journal_groups = env['account.move.line'].read_group(
            domain_base,
            ['journal_id', 'debit:sum', 'credit:sum'],
            ['journal_id'],
            orderby='journal_id asc',
        )
        rows = []
        total_d = total_c = 0.0
        for jg in journal_groups:
            jid = jg['journal_id'][0]
            jname = jg['journal_id'][1]
            d = jg.get('debit', 0.0) or 0.0
            c = jg.get('credit', 0.0) or 0.0
            rows.append({
                'row_key': f"journal:{jid}",
                'label': jname,
                'values': {'debit': d, 'credit': c},
                'expandable': True,
                'children': [],
            })
            total_d += d
            total_c += c
        return {
            'title': 'Journal Report',
            'report_type': 'journal_report',
            'date_from': date_from,
            'date_to': date_to,
            'currency': company.currency_id.name,
            'columns': [
                {'field': 'label', 'label': 'Journal', 'type': 'text'},
                {'field': 'debit', 'label': 'Total Debit', 'type': 'monetary'},
                {'field': 'credit', 'label': 'Total Credit', 'type': 'monetary'},
            ],
            'rows': rows,
            'totals': {
                'label': 'Grand Total',
                'values': {'debit': total_d, 'credit': total_c},
            },
        }

    # ── Custom report runner ──────────────────────────────────────────────────

    def _run_custom_report(self, definition_id, filters):
        env = request.env
        definition = env['financehub.report.definition'].browse(definition_id)
        if not definition.exists():
            raise UserError(f"Custom report definition {definition_id} not found.")
        spec = json.loads(definition.spec_json or '{}')
        base_model = spec.get('base_model', 'account.move.line')
        columns = spec.get('columns', [])
        groupby_fields = spec.get('groupby', [])
        spec_filters = spec.get('filters', [])

        domain = [('company_id', '=', env.company.id)]
        # Apply spec filters
        for f in spec_filters:
            field = f.get('field')
            op = f.get('operator', '=')
            val = f.get('value')
            if field and val is not None:
                domain += [(field, op, val)]
        # Apply date filter from UI filters
        date_from = filters.get('date_from')
        date_to = filters.get('date_to')
        if date_from and 'date' in env[base_model]._fields:
            domain += [('date', '>=', date_from)]
        if date_to and 'date' in env[base_model]._fields:
            domain += [('date', '<=', date_to)]

        Model = env[base_model]
        agg_fields = [c['field'] for c in columns if c.get('aggregate')]
        read_fields = list({c['field'] for c in columns} | set(groupby_fields))

        if groupby_fields and agg_fields:
            group_data = Model.read_group(
                domain,
                read_fields + [f"{f}:sum" for f in agg_fields],
                groupby_fields,
                orderby=groupby_fields[0],
                lazy=False,
            )
            rows = []
            for g in group_data:
                values = {}
                for col in columns:
                    field = col['field']
                    values[field] = g.get(field) or g.get(f"{field}:sum", 0)
                label_field = groupby_fields[0]
                label_val = g.get(label_field)
                if isinstance(label_val, (list, tuple)):
                    label_val = label_val[1] if len(label_val) > 1 else str(label_val[0])
                rows.append({
                    'row_key': f"custom:{label_val}",
                    'label': str(label_val or ''),
                    'values': values,
                    'expandable': False,
                    'children': [],
                })
        else:
            records = Model.search(domain, limit=500, order='id asc')
            rows = []
            for rec in records:
                values = {}
                for col in columns:
                    field = col['field']
                    val = getattr(rec, field, None)
                    if hasattr(val, 'id'):
                        val = val.name_get()[0][1] if val else ''
                    values[field] = val
                rows.append({
                    'row_key': f"custom:{rec.id}",
                    'label': str(getattr(rec, groupby_fields[0], rec.id) if groupby_fields else rec.id),
                    'values': values,
                    'expandable': False,
                    'children': [],
                })

        definition.touch_run()
        return {
            'title': definition.name,
            'report_type': f'custom_{definition_id}',
            'currency': env.company.currency_id.name,
            'columns': [{'field': c['field'], 'label': c.get('label', c['field']),
                          'type': c.get('type', 'text')} for c in columns],
            'rows': rows,
            'totals': {},
        }

    def _render_report_html(self, report_type, data, filters):
        """Simple HTML template for PDF generation."""
        rows_html = ''
        for row in data.get('rows', []):
            vals = row.get('values', {})
            cells = ''.join(
                f"<td>{vals.get(c['field'], '')}</td>"
                for c in data.get('columns', [])
            )
            rows_html += f"<tr><td>{'&nbsp;' * 4}{row.get('label', '')}</td>{cells}</tr>"

        headers_html = ''.join(
            f"<th>{c['label']}</th>" for c in data.get('columns', [])
        )
        return f"""<!DOCTYPE html>
<html><head><style>
body {{font-family: Arial, sans-serif; font-size: 10pt;}}
table {{width: 100%; border-collapse: collapse;}}
th, td {{border: 1px solid #ccc; padding: 4px 8px;}}
th {{background: #1F4E79; color: #fff;}}
h1 {{color: #1F4E79;}}
</style></head><body>
<h1>{data.get('title', '')}</h1>
<p>As of: {data.get('as_of', '')} {data.get('date_from', '')} – {data.get('date_to', '')}</p>
<table><thead><tr><th>Label</th>{headers_html}</tr></thead><tbody>{rows_html}</tbody></table>
</body></html>""".encode('utf-8')
