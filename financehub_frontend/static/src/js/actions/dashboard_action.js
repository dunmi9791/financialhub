/** @odoo-module **/
/**
 * FinanceHub Dashboard Action
 * ============================
 * Registered as the client action "financehub_dashboard".
 * Shows KPI cards, cash position, AR/AP, net profit MTD,
 * unreconciled statement lines count, and quick links to other pages.
 */

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { formatMonetary } from "@web/views/fields/formatters";

export class FinancehubDashboard extends Component {
    static template = "financehub.Dashboard";
    static props = {};

    setup() {
        this.fh = useService("financehub");
        this.action = useService("action");

        this.state = useState({
            loading: true,
            error: null,
            kpis: null,
        });

        onWillStart(() => this._loadKpis());
    }

    async _loadKpis() {
        this.state.loading = true;
        this.state.error = null;
        try {
            this.state.kpis = await this.fh.getDashboardKpis();
        } catch (e) {
            this.state.error = e.message;
            this.fh.notifyError(e.message, "Dashboard Error");
        } finally {
            this.state.loading = false;
        }
    }

    formatAmount(value) {
        if (value === undefined || value === null) return "—";
        const abs = Math.abs(value);
        const prefix = value < 0 ? "-" : "";
        // Simple formatting – use Odoo monetary formatter when currency is known
        return `${prefix}${(this.state.kpis?.currency_symbol || "")}${abs.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;
    }

    kpiClass(value) {
        if (value > 0) return "fh-kpi--positive";
        if (value < 0) return "fh-kpi--negative";
        return "";
    }

    openReports() {
        this.action.doAction("financehub_frontend.action_financehub_reports");
    }

    openReconciliation() {
        this.action.doAction("financehub_frontend.action_financehub_reconciliation");
    }

    async refresh() {
        await this._loadKpis();
    }
}

// Register as OWL client action
registry.category("actions").add("financehub_dashboard", FinancehubDashboard);
