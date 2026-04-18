/** @odoo-module **/
/**
 * FinanceHub – Trial Balance Action
 * ===================================
 * Standalone client action for the Trial Balance report.
 * Renders: Opening Dr/Cr | Period Dr/Cr | Closing Dr/Cr per account,
 * grouped into asset / liability / equity / income / expense sections.
 *
 * Community-Edition compatible – queries account.move.line directly.
 * No dependency on Odoo Enterprise account.report framework.
 */

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { FilterBar } from "../components/filter_bar";
import { ReportTable } from "../components/report_table";
import { DrilldownDrawer } from "../components/drilldown_drawer";
import { ExportButtons } from "../components/export_buttons";

function currentYear() { return new Date().getFullYear(); }
function today() { return new Date().toISOString().slice(0, 10); }
function yearStart() { return `${currentYear()}-01-01`; }

// Report type definition passed to FilterBar so it knows which filters to show
const TB_REPORT_DEF = {
    id: 'trial_balance',
    label: 'Trial Balance',
    supports_compare: false,
    supports_drilldown: true,
    supports_analytic: false,
    date_mode: 'range',
};

export class TrialBalanceAction extends Component {
    static template = "financehub.TrialBalance";
    static props = {};
    static components = { FilterBar, ReportTable, DrilldownDrawer, ExportButtons };

    setup() {
        this.fh           = useService("financehub");
        this.notification = useService("notification");
        this.action       = useService("action");

        this.state = useState({
            filters: {
                date_preset:  "ytd",
                date_from:    yearStart(),
                date_to:      today(),
                company_ids:  [],
                journal_ids:  [],
                analytic_ids: [],
                partner_ids:  [],
                account_ids:  [],
                compare_mode: null,
                hide_zero:    true,
            },
            loading:        false,
            reportData:     null,
            error:          null,
            drilldownOpen:  false,
            drilldownRowKey: null,
            drilldownTitle:  "",
        });

        onWillStart(() => this._loadReport());
    }

    // ── Data loading ───────────────────────────────────────────────────────

    async _loadReport() {
        this.state.loading    = true;
        this.state.error      = null;
        this.state.reportData = null;
        try {
            this.state.reportData = await this.fh.runReport("trial_balance", this.state.filters);
        } catch (e) {
            this.state.error = e.message || String(e);
        } finally {
            this.state.loading = false;
        }
    }

    // ── Filter events ──────────────────────────────────────────────────────

    async onFiltersChange(updated) {
        Object.assign(this.state.filters, updated);
        await this._loadReport();
    }

    onHideZeroToggle(ev) {
        this.state.filters.hide_zero = ev.target.checked;
        this._loadReport();
    }

    // ── Drilldown ──────────────────────────────────────────────────────────

    onRowDrilldown({ rowKey, label }) {
        // Section rows are not drillable
        if (rowKey.startsWith("section:")) return;
        this.state.drilldownRowKey  = rowKey;
        this.state.drilldownTitle   = label;
        this.state.drilldownOpen    = true;
    }

    onDrilldownClose() {
        this.state.drilldownOpen    = false;
        this.state.drilldownRowKey  = null;
    }

    // ── Export ─────────────────────────────────────────────────────────────

    onExportPdf() {
        this.fh.exportPdf("trial_balance", this.state.filters);
    }

    onExportXlsx() {
        this.fh.exportXlsx("trial_balance", this.state.filters);
    }

    // ── Computed ───────────────────────────────────────────────────────────

    get tbReportDef() { return TB_REPORT_DEF; }

    get subtitle() {
        const { date_from, date_to, currency } = this.state.reportData || {};
        const f = date_from || this.state.filters.date_from;
        const t = date_to   || this.state.filters.date_to;
        const c = currency  || "";
        return `${f} – ${t}${c ? "  ·  " + c : ""}`;
    }

    get isBalanced() {
        const totals = this.state.reportData?.totals?.values;
        if (!totals) return null;
        const cbDr = totals.cb_debit  || 0;
        const cbCr = totals.cb_credit || 0;
        return Math.abs(cbDr - cbCr) < 0.005;
    }
}

registry.category("actions").add("financehub_trial_balance", TrialBalanceAction);
