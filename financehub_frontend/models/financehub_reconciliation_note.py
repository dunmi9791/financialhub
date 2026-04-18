# -*- coding: utf-8 -*-
"""
financehub.reconciliation.note
-------------------------------
Audit trail for every reconciliation action performed through FinanceHub.
One note per action (match, split, write-off, create-payment, mark-review).
"""

from odoo import api, fields, models, _


class FinancehubReconciliationNote(models.Model):
    _name = 'financehub.reconciliation.note'
    _description = 'FinanceHub Reconciliation Audit Note'
    _order = 'action_date desc, id desc'

    # ── Links ─────────────────────────────────────────────────────────────────
    statement_line_id = fields.Many2one(
        'account.bank.statement.line',
        string='Statement Line',
        required=True,
        ondelete='cascade',
        index=True,
    )
    move_id = fields.Many2one(
        'account.move',
        string='Resulting Journal Entry',
        ondelete='set null',
    )
    payment_id = fields.Many2one(
        'account.payment',
        string='Created Payment',
        ondelete='set null',
    )

    # ── Action metadata ───────────────────────────────────────────────────────
    action_type = fields.Selection(
        selection=[
            ('match',          'Matched'),
            ('split',          'Split Line'),
            ('writeoff',       'Write-Off'),
            ('create_payment', 'Created Payment'),
            ('mark_review',    'Marked for Review'),
            ('unreconcile',    'Unreconciled'),
        ],
        string='Action',
        required=True,
        index=True,
    )
    action_date = fields.Datetime(
        string='Action Date',
        required=True,
        default=fields.Datetime.now,
        index=True,
    )
    performed_by = fields.Many2one(
        'res.users',
        string='Performed By',
        required=True,
        default=lambda self: self.env.user,
        index=True,
    )
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        default=lambda self: self.env.company,
    )

    # ── Detail payload ────────────────────────────────────────────────────────
    note = fields.Text(string='Note / Label')
    amount = fields.Monetary(
        string='Amount',
        currency_field='currency_id',
    )
    currency_id = fields.Many2one(
        'res.currency',
        string='Currency',
        default=lambda self: self.env.company.currency_id,
    )
    payload_json = fields.Text(
        string='Raw Payload (JSON)',
        help='Full action payload as sent by the OWL client (for debugging).',
    )

    # ─────────────────────────────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────────────────────────────

    @api.model
    def log_action(self, statement_line_id, action_type, **kwargs):
        """Create an audit note.  Called by the reconciliation controller."""
        vals = {
            'statement_line_id': statement_line_id,
            'action_type': action_type,
            'performed_by': self.env.user.id,
            'company_id': self.env.company.id,
        }
        vals.update(kwargs)
        return self.create(vals)

    @api.model
    def get_audit_log(self, statement_line_id):
        """Return the audit trail for a statement line."""
        notes = self.search(
            [('statement_line_id', '=', statement_line_id)],
            order='action_date asc',
        )
        return notes.read([
            'id', 'action_type', 'action_date', 'performed_by',
            'note', 'amount', 'currency_id', 'move_id', 'payment_id',
        ])
