# -*- coding: utf-8 -*-
"""
FinanceHub – Bank Reconciliation Controller
=============================================
JSON endpoints consumed by the OWL reconciliation workspace.
"""

import json
import logging
from datetime import date

from odoo import http, fields, _
from odoo.http import request
from odoo.exceptions import AccessError, UserError

_logger = logging.getLogger(__name__)

RECONCILIATION_GROUPS = [
    'account.group_account_user',
    'account.group_account_manager',
]


def _require_reconciliation(user=None):
    user = user or request.env.user
    if not any(user.has_group(g) for g in RECONCILIATION_GROUPS):
        raise AccessError(_("FinanceHub: accounting access required for reconciliation."))


def _json_ok(data):
    return request.make_json_response({'status': 'ok', 'data': data})


def _json_err(msg, code=400):
    return request.make_json_response({'status': 'error', 'message': str(msg)}, status=code)


def _parse_body():
    try:
        return json.loads(request.httprequest.data or b'{}')
    except (TypeError, ValueError) as exc:
        raise UserError(_("Invalid JSON request body: %s") % exc)


class FinancehubReconciliationController(http.Controller):

    # ── Statement lines ───────────────────────────────────────────────────────

    @http.route('/financehub/bank/statement_lines', type='http', auth='user',
                methods=['POST'], csrf=False)
    def statement_lines(self):
        _require_reconciliation()
        payload = _parse_body()
        env = request.env
        company = env.company

        domain = [('company_id', '=', company.id)]

        journal_ids = payload.get('journal_ids', [])
        if journal_ids:
            domain += [('journal_id', 'in', journal_ids)]

        date_from = payload.get('date_from')
        date_to = payload.get('date_to')
        if date_from:
            domain += [('date', '>=', date_from)]
        if date_to:
            domain += [('date', '<=', date_to)]

        status = payload.get('status', 'all')
        if status == 'unreconciled':
            domain += [('is_reconciled', '=', False)]
        elif status == 'reconciled':
            domain += [('is_reconciled', '=', True)]

        search_q = payload.get('search', '').strip()
        if search_q:
            domain += ['|', '|',
                       ('payment_ref', 'ilike', search_q),
                       ('partner_name', 'ilike', search_q),
                       ('narration', 'ilike', search_q)]

        page = int(payload.get('page', 1))
        page_size = int(payload.get('page_size', 50))

        BankLine = env['account.bank.statement.line']
        total = BankLine.search_count(domain)
        lines = BankLine.search(
            domain,
            limit=page_size,
            offset=(page - 1) * page_size,
            order='date desc, id desc',
        )

        result = []
        for ln in lines:
            result.append({
                'id': ln.id,
                'date': ln.date.isoformat() if ln.date else None,
                'payment_ref': ln.payment_ref or '',
                'partner_id': ln.partner_id.id if ln.partner_id else None,
                'partner_name': ln.partner_id.name if ln.partner_id else (ln.partner_name or ''),
                'amount': ln.amount,
                'currency': ln.currency_id.name if ln.currency_id else company.currency_id.name,
                'journal': ln.journal_id.name,
                'journal_id': ln.journal_id.id,
                'is_reconciled': ln.is_reconciled,
                'move_name': ln.move_id.name if ln.move_id else '',
                'narration': ln.narration or '',
            })

        return _json_ok({
            'lines': result,
            'total': total,
            'page': page,
            'page_size': page_size,
            'pages': (total + page_size - 1) // page_size,
        })

    # ── Match suggestions ─────────────────────────────────────────────────────

    @http.route('/financehub/bank/match_suggestions', type='http', auth='user',
                methods=['POST'], csrf=False)
    def match_suggestions(self):
        _require_reconciliation()
        payload = _parse_body()
        line_id = payload.get('line_id')
        if not line_id:
            return _json_err("line_id required")

        env = request.env
        bank_line = env['account.bank.statement.line'].browse(int(line_id))
        if not bank_line.exists():
            return _json_err(f"Statement line {line_id} not found", 404)

        suggestions = self._compute_suggestions(bank_line)
        return _json_ok({'line_id': line_id, 'suggestions': suggestions})

    def _compute_suggestions(self, bank_line):
        """Return candidate matches for a statement line."""
        env = request.env
        suggestions = []
        amount = bank_line.amount
        currency = bank_line.currency_id or bank_line.company_id.currency_id
        partner_id = bank_line.partner_id.id if bank_line.partner_id else None

        # 1. Existing payments (unreconciled)
        pay_domain = [
            ('state', '=', 'posted'),
            ('company_id', '=', bank_line.company_id.id),
            ('is_reconciled', '=', False),
        ]
        if partner_id:
            pay_domain += [('partner_id', '=', partner_id)]
        # Amount sign
        if amount >= 0:
            pay_domain += [('payment_type', '=', 'inbound')]
        else:
            pay_domain += [('payment_type', '=', 'outbound')]

        payments = env['account.payment'].search(pay_domain, limit=20)
        for pay in payments:
            score = 100 if abs(pay.amount - abs(amount)) < 0.01 else max(0, 80 - abs(pay.amount - abs(amount)))
            suggestions.append({
                'type': 'payment',
                'id': pay.id,
                'label': f"{pay.name} – {pay.partner_id.name or ''}",
                'date': pay.date.isoformat() if pay.date else None,
                'amount': pay.amount if amount >= 0 else -pay.amount,
                'currency': pay.currency_id.name,
                'score': score,
            })

        # 2. Outstanding move lines (invoices etc.)
        ml_domain = [
            ('move_id.state', '=', 'posted'),
            ('reconciled', '=', False),
            ('company_id', '=', bank_line.company_id.id),
            ('account_id.reconcile', '=', True),
        ]
        if partner_id:
            ml_domain += [('partner_id', '=', partner_id)]
        move_lines = env['account.move.line'].search(ml_domain, limit=20)
        for ml in move_lines:
            score = 90 if abs(ml.amount_residual - abs(amount)) < 0.01 else max(0, 60 - abs(ml.amount_residual - abs(amount)))
            suggestions.append({
                'type': 'move_line',
                'id': ml.id,
                'label': f"{ml.move_id.name} – {ml.name or ''}",
                'date': ml.date.isoformat() if ml.date else None,
                'amount': ml.amount_residual,
                'currency': ml.currency_id.name if ml.currency_id else currency.name,
                'score': score,
            })

        # Sort by score descending
        suggestions.sort(key=lambda x: -x['score'])
        return suggestions[:30]

    # ── Reconcile ─────────────────────────────────────────────────────────────

    @http.route('/financehub/bank/reconcile', type='http', auth='user',
                methods=['POST'], csrf=False)
    def reconcile(self):
        _require_reconciliation()
        payload = _parse_body()
        env = request.env
        action_type = payload.get('action')
        line_id = payload.get('line_id')

        if not line_id:
            return _json_err("line_id required")

        bank_line = env['account.bank.statement.line'].browse(int(line_id))
        if not bank_line.exists():
            return _json_err(f"Statement line {line_id} not found", 404)

        Note = env['financehub.reconciliation.note']

        try:
            if action_type == 'match':
                result = self._do_match(bank_line, payload)
                Note.log_action(bank_line.id, 'match',
                                note=payload.get('note', ''),
                                move_id=result.get('move_id'),
                                payload_json=json.dumps(payload))

            elif action_type == 'writeoff':
                result = self._do_writeoff(bank_line, payload)
                Note.log_action(bank_line.id, 'writeoff',
                                note=payload.get('label', ''),
                                amount=payload.get('amount'),
                                payload_json=json.dumps(payload))

            elif action_type == 'split':
                result = self._do_split(bank_line, payload)
                Note.log_action(bank_line.id, 'split',
                                note='Line split',
                                payload_json=json.dumps(payload))

            elif action_type == 'create_payment':
                if not env.user.has_group('account.group_account_manager'):
                    return _json_err("Only accounting managers can create payments.", 403)
                result = self._do_create_payment(bank_line, payload)
                Note.log_action(bank_line.id, 'create_payment',
                                note=payload.get('memo', ''),
                                payment_id=result.get('payment_id'),
                                amount=payload.get('amount'),
                                payload_json=json.dumps(payload))

            elif action_type == 'mark_review':
                bank_line.write({'is_reconciled': False})  # ensure flagged
                result = {'status': 'marked_for_review'}
                Note.log_action(bank_line.id, 'mark_review',
                                note=payload.get('note', ''))

            else:
                return _json_err(f"Unknown action: {action_type}")

        except Exception as exc:
            _logger.exception("FinanceHub reconcile error")
            return _json_err(str(exc))

        return _json_ok(result)

    def _do_match(self, bank_line, payload):
        """Match bank line to existing payments or move lines."""
        env = request.env
        match_type = payload.get('match_type')
        match_id = payload.get('match_id')
        if not match_id:
            raise UserError("match_id required for match action")

        if match_type == 'payment':
            payment = env['account.payment'].browse(int(match_id))
            if not payment.exists():
                raise UserError(f"Payment {match_id} not found")
            # Reconcile via the bank statement line's wizard
            # In Odoo 17 the preferred approach is reconcile_move_lines
            line = payment.line_ids.filtered(
                lambda l: l.account_id.account_type in ('asset_receivable', 'liability_payable', 'asset_cash')
            )[:1]
            if line:
                bank_line.reconcile([{'id': line.id, 'balance': bank_line.amount}])
            return {'reconciled': True, 'match_type': 'payment', 'move_id': payment.move_id.id}

        elif match_type == 'move_line':
            move_line = env['account.move.line'].browse(int(match_id))
            if not move_line.exists():
                raise UserError(f"Move line {match_id} not found")
            bank_line.reconcile([{'id': move_line.id, 'balance': bank_line.amount}])
            return {'reconciled': True, 'match_type': 'move_line', 'move_id': move_line.move_id.id}

        raise UserError(f"Unknown match_type: {match_type}")

    def _do_writeoff(self, bank_line, payload):
        """Create a write-off entry and reconcile."""
        env = request.env
        account_id = payload.get('account_id')
        amount = payload.get('amount', bank_line.amount)
        label = payload.get('label', 'Write-off')
        if not account_id:
            raise UserError("account_id required for write-off")

        account = env['account.account'].browse(int(account_id))
        if not account.exists():
            raise UserError(f"Account {account_id} not found")

        # In Odoo 17, write-off entries are passed as candidates_vals without an 'id' field
        writeoff_vals = [{
            'account_id': account.id,
            'balance': float(amount),
            'name': label,
            'tax_ids': [(6, 0, payload.get('tax_ids', []))],
        }]
        bank_line.reconcile(writeoff_vals)
        return {'reconciled': True, 'write_off': True}

    def _do_split(self, bank_line, payload):
        """Split a statement line into multiple lines."""
        env = request.env
        parts = payload.get('parts', [])
        if not parts:
            raise UserError("parts list required for split")
        total = sum(float(p.get('amount', 0)) for p in parts)
        if abs(total - bank_line.amount) > 0.01:
            raise UserError(
                f"Split amounts ({total}) do not match statement line amount ({bank_line.amount})"
            )
        created_ids = []
        for i, part in enumerate(parts[1:], start=1):
            new_line = bank_line.copy({
                'amount': float(part['amount']),
                'payment_ref': part.get('label', f"Split {i}"),
            })
            created_ids.append(new_line.id)
        bank_line.write({'amount': float(parts[0]['amount']),
                         'payment_ref': parts[0].get('label', bank_line.payment_ref)})
        return {'split': True, 'original_id': bank_line.id, 'new_ids': created_ids}

    def _do_create_payment(self, bank_line, payload):
        """Create a payment from a statement line."""
        env = request.env
        partner_id = payload.get('partner_id') or (bank_line.partner_id.id if bank_line.partner_id else None)
        if not partner_id:
            raise UserError("partner_id required to create a payment")

        amount = abs(bank_line.amount)
        payment_type = 'inbound' if bank_line.amount >= 0 else 'outbound'
        payment_vals = {
            'payment_type': payment_type,
            'partner_id': int(partner_id),
            'amount': amount,
            'currency_id': bank_line.currency_id.id or bank_line.company_id.currency_id.id,
            'date': bank_line.date,
            'journal_id': bank_line.journal_id.id,
            'memo': payload.get('memo', bank_line.payment_ref or ''),
            'company_id': bank_line.company_id.id,
        }
        payment = env['account.payment'].create(payment_vals)
        payment.action_post()
        # Reconcile the payment with the statement line
        line = payment.line_ids.filtered(
            lambda l: l.account_id.account_type in ('asset_cash',)
        )[:1]
        if line:
            bank_line.reconcile([{'id': line.id, 'balance': bank_line.amount}])
        return {'payment_id': payment.id, 'payment_name': payment.name, 'reconciled': True}

    # ── Audit log ─────────────────────────────────────────────────────────────

    @http.route('/financehub/bank/audit_log', type='http', auth='user',
                methods=['POST'], csrf=False)
    def audit_log(self):
        _require_reconciliation()
        payload = _parse_body()
        line_id = payload.get('line_id')
        if not line_id:
            return _json_err("line_id required")
        notes = request.env['financehub.reconciliation.note'].get_audit_log(int(line_id))
        return _json_ok({'line_id': line_id, 'notes': notes})

    # ── Dashboard KPIs ────────────────────────────────────────────────────────

    @http.route('/financehub/dashboard/kpis', type='http', auth='user',
                methods=['GET'], csrf=False)
    def dashboard_kpis(self):
        _require_reconciliation()
        env = request.env
        company = env.company
        today = date.today()
        first_day = today.replace(day=1)

        # Cash position
        cash_lines = env['account.move.line'].read_group(
            [('account_id.account_type', '=', 'asset_cash'),
             ('move_id.state', '=', 'posted'),
             ('company_id', '=', company.id)],
            ['balance:sum'], [],
        )
        cash_position = cash_lines[0].get('balance', 0.0) or 0.0 if cash_lines else 0.0

        # AR total
        ar_lines = env['account.move.line'].read_group(
            [('account_id.account_type', '=', 'asset_receivable'),
             ('reconciled', '=', False),
             ('move_id.state', '=', 'posted'),
             ('company_id', '=', company.id)],
            ['amount_residual:sum'], [],
        )
        ar_total = ar_lines[0].get('amount_residual', 0.0) or 0.0 if ar_lines else 0.0

        # AP total
        ap_lines = env['account.move.line'].read_group(
            [('account_id.account_type', '=', 'liability_payable'),
             ('reconciled', '=', False),
             ('move_id.state', '=', 'posted'),
             ('company_id', '=', company.id)],
            ['amount_residual:sum'], [],
        )
        ap_total = ap_lines[0].get('amount_residual', 0.0) or 0.0 if ap_lines else 0.0

        # Net profit MTD
        income_mtd = env['account.move.line'].read_group(
            [('account_id.account_type', 'in', ['income', 'income_other']),
             ('move_id.state', '=', 'posted'),
             ('date', '>=', first_day.isoformat()),
             ('company_id', '=', company.id)],
            ['balance:sum'], [],
        )
        expense_mtd = env['account.move.line'].read_group(
            [('account_id.account_type', 'in', ['expense', 'expense_depreciation', 'expense_direct_cost']),
             ('move_id.state', '=', 'posted'),
             ('date', '>=', first_day.isoformat()),
             ('company_id', '=', company.id)],
            ['balance:sum'], [],
        )
        income_val = -(income_mtd[0].get('balance', 0.0) or 0.0) if income_mtd else 0.0
        expense_val = expense_mtd[0].get('balance', 0.0) or 0.0 if expense_mtd else 0.0
        net_profit_mtd = income_val - expense_val

        # Unreconciled statement lines count
        unrecon_count = env['account.bank.statement.line'].search_count([
            ('is_reconciled', '=', False),
            ('company_id', '=', company.id),
        ])

        return _json_ok({
            'currency': company.currency_id.name,
            'currency_symbol': company.currency_id.symbol,
            'cash_position': cash_position,
            'ar_total': ar_total,
            'ap_total': ap_total,
            'net_profit_mtd': net_profit_mtd,
            'unrecon_count': unrecon_count,
            'period_label': f"{first_day.strftime('%b %Y')}",
            'as_of': today.isoformat(),
        })
