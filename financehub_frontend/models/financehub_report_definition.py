# -*- coding: utf-8 -*-
"""
financehub.report.definition
-----------------------------
Stores no-code custom report templates created through the Report Builder.
Each definition contains the full specification as JSON:
  - base dataset / filters
  - columns
  - grouping
  - aggregations
  - computed fields
"""

import json
from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class FinancehubReportDefinition(models.Model):
    _name = 'financehub.report.definition'
    _description = 'FinanceHub Custom Report Definition'
    _order = 'name asc'
    _rec_name = 'name'

    # ── Identity ──────────────────────────────────────────────────────────────
    name = fields.Char(string='Report Name', required=True, size=128)
    description = fields.Text(string='Description')
    icon = fields.Char(string='Icon', default='fa-file-text-o', size=64)
    color = fields.Integer(string='Color Index', default=0)
    active = fields.Boolean(default=True)

    # ── Definition (JSON) ─────────────────────────────────────────────────────
    # Full spec serialised by the OWL report builder
    spec_json = fields.Text(
        string='Report Spec (JSON)',
        required=True,
        default='{}',
        help='Full report specification including filters, columns, grouping, '
             'aggregations, and computed fields.',
    )

    # Denormalised quick-access fields (derived from spec_json)
    base_model = fields.Char(
        string='Base Model',
        compute='_compute_from_spec',
        store=True,
    )
    column_count = fields.Integer(
        string='Columns',
        compute='_compute_from_spec',
        store=True,
    )

    # ── Ownership / sharing ───────────────────────────────────────────────────
    owner_id = fields.Many2one(
        'res.users',
        string='Created By',
        default=lambda self: self.env.user,
        index=True,
    )
    company_id = fields.Many2one(
        'res.company',
        string='Company',
        default=lambda self: self.env.company,
    )
    is_public = fields.Boolean(
        string='Available to all accountants',
        default=False,
    )

    # ── Timestamps ────────────────────────────────────────────────────────────
    last_run = fields.Datetime(string='Last Run', readonly=True)
    run_count = fields.Integer(string='Run Count', default=0, readonly=True)

    # ─────────────────────────────────────────────────────────────────────────
    # Computed
    # ─────────────────────────────────────────────────────────────────────────

    @api.depends('spec_json')
    def _compute_from_spec(self):
        for rec in self:
            try:
                spec = json.loads(rec.spec_json or '{}')
            except (TypeError, ValueError):
                spec = {}
            rec.base_model = spec.get('base_model', 'account.move.line')
            columns = spec.get('columns', [])
            rec.column_count = len(columns) if isinstance(columns, list) else 0

    # ─────────────────────────────────────────────────────────────────────────
    # Validation
    # ─────────────────────────────────────────────────────────────────────────

    @api.constrains('spec_json')
    def _check_spec_json(self):
        allowed_models = {
            'account.move.line',
            'account.move',
            'account.account',
            'res.partner',
            'account.analytic.line',
        }
        for rec in self:
            try:
                spec = json.loads(rec.spec_json)
            except (TypeError, ValueError):
                raise ValidationError(_("Report Spec must be valid JSON."))
            base = spec.get('base_model', 'account.move.line')
            if base not in allowed_models:
                raise ValidationError(
                    _("Base model '%(m)s' is not allowed. "
                      "Allowed models: %(a)s", m=base, a=', '.join(sorted(allowed_models)))
                )

    # ─────────────────────────────────────────────────────────────────────────
    # Public API
    # ─────────────────────────────────────────────────────────────────────────

    @api.model
    def list_definitions(self):
        """Return definitions visible to the current user."""
        domain = [
            '|',
            ('owner_id', '=', self.env.user.id),
            ('is_public', '=', True),
            ('active', '=', True),
        ]
        records = self.search(domain, order='name asc')
        return records.read([
            'id', 'name', 'description', 'icon', 'color',
            'base_model', 'column_count', 'owner_id',
            'is_public', 'last_run', 'run_count',
        ])

    @api.model
    def upsert_definition(self, vals):
        """Create or update a report definition. Returns id."""
        def_id = vals.pop('id', None)
        if def_id:
            rec = self.browse(def_id)
            rec.write(vals)
            return rec.id
        vals.setdefault('owner_id', self.env.user.id)
        vals.setdefault('company_id', self.env.company.id)
        return self.create(vals).id

    def touch_run(self):
        self.write({
            'last_run': fields.Datetime.now(),
            'run_count': self.run_count + 1,
        })
