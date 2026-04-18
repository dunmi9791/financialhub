/** @odoo-module **/
/**
 * FinanceHub Saved Reports Library
 * ==================================
 * Registered as the client action "financehub_saved_reports".
 * Shows all saved report configurations.  Users can search, filter
 * by ownership, duplicate, edit, delete, and set defaults.
 */

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

// Map report_type → human label (keep in sync with Python REPORT_REGISTRY)
const REPORT_TYPE_LABELS = {
    balance_sheet:   "Balance Sheet",
    profit_loss:     "Profit & Loss",
    cash_flow:       "Cash Flow",
    trial_balance:   "Trial Balance",
    general_ledger:  "General Ledger",
    aged_receivable: "Aged Receivable",
    aged_payable:    "Aged Payable",
    journal_report:  "Journal Report",
    custom:          "Custom",
};

export class FinancehubSavedReports extends Component {
    static template = "financehub.SavedReports";
    static props = {};

    setup() {
        this.fh = useService("financehub");
        this.action = useService("action");
        this.orm = useService("orm");

        this.state = useState({
            loading: true,
            configs: [],
            searchQuery: "",
            viewMode: "all",   // 'all' | 'mine' | 'shared'
            editingConfig: null,  // config being edited
            confirmDeleteId: null,
        });

        onWillStart(() => this._loadAll());
    }

    async _loadAll() {
        this.state.loading = true;
        try {
            // Load all standard report types to gather configs
            const types = ["balance_sheet", "profit_loss", "cash_flow", "trial_balance",
                           "general_ledger", "aged_receivable", "aged_payable", "journal_report", "custom"];
            const allConfigs = [];
            for (const t of types) {
                const configs = await this.fh.getSavedConfigs(t);
                allConfigs.push(...configs);
            }
            this.state.configs = allConfigs;
        } catch (e) {
            this.fh.notifyError(e.message);
        } finally {
            this.state.loading = false;
        }
    }

    // ── Computed ──────────────────────────────────────────────────────────

    get filteredConfigs() {
        let configs = this.state.configs;
        const q = this.state.searchQuery.trim().toLowerCase();
        if (q) {
            configs = configs.filter(c =>
                (c.name || "").toLowerCase().includes(q) ||
                (c.description || "").toLowerCase().includes(q) ||
                (c.tags || "").toLowerCase().includes(q)
            );
        }
        if (this.state.viewMode === "mine") {
            configs = configs.filter(c => c.owner_id?.[0] === this._currentUserId);
        } else if (this.state.viewMode === "shared") {
            configs = configs.filter(c => c.sharing === "shared");
        }
        return configs;
    }

    get _currentUserId() {
        return odoo.user_id || 0;
    }

    reportTypeLabel(type) {
        return REPORT_TYPE_LABELS[type] || type;
    }

    // ── Actions ───────────────────────────────────────────────────────────

    async onOpen(config) {
        // Navigate to reports page and pre-load this config
        await this.fh.touchConfig(config.id);
        this.action.doAction({
            type: "ir.actions.client",
            tag: "financehub_reports",
            params: { load_config_id: config.id },
        });
    }

    async onDelete(config) {
        this.state.confirmDeleteId = config.id;
    }

    async onConfirmDelete() {
        try {
            await this.fh.deleteConfig(this.state.confirmDeleteId);
            this.fh.notifySuccess("Saved config deleted.");
            this.state.confirmDeleteId = null;
            await this._loadAll();
        } catch (e) {
            this.fh.notifyError(e.message);
        }
    }

    onCancelDelete() {
        this.state.confirmDeleteId = null;
    }

    onEdit(config) {
        this.state.editingConfig = { ...config };
    }

    async onSaveEdit() {
        try {
            await this.fh.saveConfig({ ...this.state.editingConfig });
            this.fh.notifySuccess("Config updated.");
            this.state.editingConfig = null;
            await this._loadAll();
        } catch (e) {
            this.fh.notifyError(e.message);
        }
    }

    onCancelEdit() {
        this.state.editingConfig = null;
    }

    async onDuplicate(config) {
        try {
            const copy = {
                name: `${config.name} (copy)`,
                description: config.description,
                tags: config.tags,
                report_type: config.report_type,
                filter_payload: config.filter_payload,
                sharing: "private",
                is_default: false,
            };
            await this.fh.saveConfig(copy);
            this.fh.notifySuccess("Config duplicated.");
            await this._loadAll();
        } catch (e) {
            this.fh.notifyError(e.message);
        }
    }

    onSearchInput(ev) {
        this.state.searchQuery = ev.target.value;
    }

    setViewMode(mode) {
        this.state.viewMode = mode;
    }
}

registry.category("actions").add("financehub_saved_reports", FinancehubSavedReports);
