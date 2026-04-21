# -*- coding: utf-8 -*-
{
    'name': 'FinanceHub Frontend',
    'version': '17.0.1.0.0',
    'category': 'Accounting/Accounting',
    'summary': 'Modern OWL-based finance reporting, custom report builder and bank reconciliation UI',
    'description': """
FinanceHub Frontend
===================
A fully-featured Odoo addon delivering a modern OWL-based finance UI:

- Balance Sheet, P&L, Cashflow, Trial Balance, General Ledger, Aged AR/AP, Journal Report
- Configurable filters: date range, company, journals, analytic, tags, partner, currency
- Drill-down from report lines to underlying journal entries
- PDF / XLSX export
- Saved report configurations (private + shared)
- No-code custom report builder
- Bank reconciliation workspace with match suggestions, split, write-off, create payment
- Full audit trail for reconciliation actions
    """,
    'author': 'FinanceHub',
    'website': 'https://github.com/your-org/financehub',
    'depends': [
        'account',
        'web',
    ],
    'data': [
        'security/financehub_security.xml',
        'security/ir.model.access.csv',
        'views/financehub_actions.xml',
        'views/financehub_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'financehub_frontend/static/src/scss/financehub.scss',
            # Services
            'financehub_frontend/static/src/js/services/financehub_service.js',
            # Shared / reusable components
            'financehub_frontend/static/src/js/components/filter_bar.js',
            'financehub_frontend/static/src/js/components/report_table.js',
            'financehub_frontend/static/src/js/components/drilldown_drawer.js',
            'financehub_frontend/static/src/js/components/saved_config_modal.js',
            'financehub_frontend/static/src/js/components/export_buttons.js',
            # Report builder components
            'financehub_frontend/static/src/js/components/builder_filters.js',
            'financehub_frontend/static/src/js/components/builder_columns.js',
            'financehub_frontend/static/src/js/components/builder_grouping.js',
            'financehub_frontend/static/src/js/components/builder_preview.js',
            # Reconciliation components
            'financehub_frontend/static/src/js/components/statement_lines_list.js',
            'financehub_frontend/static/src/js/components/match_candidates_panel.js',
            'financehub_frontend/static/src/js/components/reconciliation_workbench.js',
            # Page-level client actions
            'financehub_frontend/static/src/js/actions/dashboard_action.js',
            'financehub_frontend/static/src/js/actions/reports_action.js',
            'financehub_frontend/static/src/js/actions/saved_reports_action.js',
            'financehub_frontend/static/src/js/actions/report_builder_action.js',
            'financehub_frontend/static/src/js/actions/reconciliation_action.js',
            # Standard standalone reports (add files to server before re-enabling)
            # 'financehub_frontend/static/src/js/actions/trial_balance_action.js',
            # QWeb templates
            'financehub_frontend/static/src/xml/components.xml',
            'financehub_frontend/static/src/xml/dashboard.xml',
            'financehub_frontend/static/src/xml/reports.xml',
            'financehub_frontend/static/src/xml/saved_reports.xml',
            'financehub_frontend/static/src/xml/report_builder.xml',
            'financehub_frontend/static/src/xml/reconciliation.xml',
            # 'financehub_frontend/static/src/xml/trial_balance.xml',
        ],
    },
    'installable': True,
    'application': False,
    'license': 'LGPL-3',
}
