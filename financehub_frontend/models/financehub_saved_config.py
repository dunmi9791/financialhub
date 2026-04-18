# -*- coding: utf-8 -*-
"""
financehub.saved.config
-----------------------
Stores user-defined report filter configurations so they can be re-applied
from the Saved Reports library.  Each record belongs to one user (owner) and
optionally shared with a group.
"""

import json
from odoo import api, fields, models, _
from odoo.exceptions import AccessError, ValidationError


class FinancehubSavedConfig(models.Model):
    _name = 'financehub.saved.config'
    _description = 'FinanceHub Saved Report Configuration'
    _order = 'name asc'
    _rec_name = 'name'

    # ── Identity ──────────────────────────────────────────────────────────────
    name = fields.Char(
        string='Config Name',
        required=True,
        size=128,
    )
    description = fields.Text(string='Description')
    tags = fields.Char(
        string='Tags',
        help='Comma-separated tags for quick filtering.',
    )

    # ── Report type ───────────────────────────────────────────────────────────
    report_type = fields.Selection(
        selection=[
            ('balance_sheet',      'Balance Sheet'),
            ('profit_loss',        'Profit & Loss'),
            ('cash_flow',          'Cash Flow'),
            ('trial_balance',      'Trial Balance'),
            ('general_ledger',     'General Ledger'),
            ('aged_receivable',    'Aged Receivable'),
            ('aged_payable',       'Aged Payable'),
            ('journal_report',     'Journal Report'),
            ('custom',             'Custom Report'),
        ],
        string='Report Type',
        required=True,
        index=True,
    )
    # Reference to a custom report definition (only when report_type='custom')
    custom_report_id = fields.Many2one(
        'financehub.report.definition',
        string='Custom Report Template',
        ondelete='set null',
    )

    # ── Serialised filter payload ─────────────────────────────────────────────
    filter_payload = fields.Text(
        string='Filter Payload (JSON)',
        help='JSON-serialised filter state as sent by the OWL FilterBar component.',
    )

    # ── Ownership / sharing ───────────────────────────────────────────────────
    owner_id = fields.Many2one(
        'res.users',
        string='Owner',
        required=True,
        default=lambda self: self.env.user,
        index=True,
    )
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        default=lambda self: self.env.company,
        index=True,
    )
    sharing = fields.Selection(
        selection=[
            ('private', 'Private (only me)'),
            ('shared',  'Shared (all accountants in my company)'),
        ],
        string='Sharing',
        required=True,
        default='private',
    )

    # ── User preference ───────────────────────────────────────────────────────
    is_default = fields.Boolean(
        string='Default for this report',
        default=False,
        help='When True this config is auto-loaded when the user opens the report.',
    )

    # ── Timestamps ────────────────────────────────────────────────────────────
    last_used = fields.Datetime(string='Last Used', readonly=True)

    # ─────────────────────────────────────────────────────────────────────────
    # ORM helpers
    # ─────────────────────────────────────────────────────────────────────────

    @api.constrains('filter_payload')
    def _check_filter_payload_json(self):
        for rec in self:
            if rec.filter_payload:
                try:
                    json.loads(rec.filter_payload)
                except (TypeError, ValueError):
                    raise ValidationError(
                        _("Filter Payload must be valid JSON.")
                    )

    @api.constrains('is_default', 'report_type', 'owner_id', 'company_id')
    def _check_single_default(self):
        """At most one default per (user, report_type, company)."""
        for rec in self.filtered('is_default'):
            duplicate = self.search([
                ('id', '!=', rec.id),
                ('is_default', '=', True),
                ('report_type', '=', rec.report_type),
                ('owner_id', '=', rec.owner_id.id),
                ('company_id', '=', rec.company_id.id),
            ], limit=1)
            if duplicate:
                raise ValidationError(
                    _("A default config already exists for this report type "
                      "and user. Please unset the existing default first.")
                )

    # ─────────────────────────────────────────────────────────────────────────
    # Public API (called from OWL via orm.call)
    # ─────────────────────────────────────────────────────────────────────────

    @api.model
    def get_configs_for_report(self, report_type):
        """Return configs visible to the current user for a given report type."""
        domain = [
            ('report_type', '=', report_type),
            '|',
            ('owner_id', '=', self.env.user.id),
            ('sharing', '=', 'shared'),
        ]
        if self.env.company:
            domain += [('company_id', 'in', [False, self.env.company.id])]
        records = self.search(domain, order='is_default desc, name asc')
        return records.read([
            'id', 'name', 'description', 'tags', 'report_type',
            'custom_report_id', 'filter_payload', 'owner_id',
            'sharing', 'is_default', 'last_used',
        ])

    @api.model
    def save_config(self, vals):
        """Create or update a saved config.  Returns the record id."""
        config_id = vals.pop('id', None)
        if config_id:
            record = self.browse(config_id)
            if record.owner_id.id != self.env.user.id and not self.env.user.has_group(
                'account.group_account_manager'
            ):
                raise AccessError(_("You can only edit your own saved configs."))
            record.write(vals)
            return record.id
        else:
            vals['owner_id'] = self.env.user.id
            vals['company_id'] = self.env.company.id
            return self.create(vals).id

    @api.model
    def touch_last_used(self, config_id):
        self.browse(config_id).write({'last_used': fields.Datetime.now()})

    # ─────────────────────────────────────────────────────────────────────────
    # Record-rule helpers (called from ir.rule domain)
    # ─────────────────────────────────────────────────────────────────────────

    def _is_owner(self):
        return self.owner_id == self.env.user
