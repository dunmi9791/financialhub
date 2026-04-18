/** @odoo-module **/
/**
 * FinanceHub Reports Action
 * ==========================
 * Registered as the client action "financehub_reports".
 * Full-featured financial report viewer with:
 *  - Left report selector panel
 *  - Top filter bar (date, company, journals, analytic, compare)
 *  - Main report table with fold/unfold sections
 *  - Drilldown drawer
 *  - Save config / Export PDF+XLSX
 */

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { FilterBar } from "../components/filter_bar";
import { ReportTable } from "../components/report_table";
import { DrilldownDrawer } from "../components/drilldown_drawer";
import { SavedConfigModal } from "../components/saved_config_modal";
import { ExportButtons } from "../components/export_buttons";

// Default date helpers
function today() {
    return new Date().toISOString().slice(0, 10);
}
function firstDayOfYear() {
    return `${new Date().getFullYear()}-01-01`;
}
function firstDayOfMonth() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function lastDayOfLastMonth() {
    const d = new Date();
    d.setDate(0);
    return d.toISOString().slice(0, 10);
}
function firstDayOfLastMonth() {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
}

export class FinancehubReports extends Component {
    static template = "financehub.Reports";
    static props = {};
    static components = { FilterBar, ReportTable, DrilldownDrawer, SavedConfigModal, ExportButtons };

    setup() {
        this.fh = useService("financehub");
        this.notification = useService("notification");

        this.state = useState({
            // Report selector
            reportTypes: [],
            selectedReportType: null,
            // Filter state
            filters: {
                date_preset: "ytd",
                date_from: firstDayOfYear(),
                date_to: today(),
                company_ids: [],
                journal_ids: [],
                analytic_ids: [],
                partner_ids: [],
                account_ids: [],
                compare_mode: null,  // 'prev_period' | 'last_year' | null
            },
            // Report data
            loading: false,
            reportData: null,
            error: null,
            // Drilldown
            drilldownOpen: false,
            drilldownRowKey: null,
            drilldownTitle: "",
            // Save config modal
            saveModalOpen: false,
            // Saved configs for current report
            savedConfigs: [],
        });

        onWillStart(async () => {
            this.state.reportTypes = await this.fh.getReportTypes();
            if (this.state.reportTypes.length > 0) {
                this.state.selectedReportType = this.state.reportTypes[0].id;
                await this._runReport();
            }
        });
    }

    // ── Report loading ────────────────────────────────────────────────────

    async _runReport() {
        if (!this.state.selectedReportType) return;
        this.state.loading = true;
        this.state.error = null;
        this.state.reportData = null;
        try {
            this.state.reportData = await this.fh.runReport(
                this.state.selectedReportType,
                this.state.filters
            );
        } catch (e) {
            this.state.error = e.message;
            this.fh.notifyError(e.message, "Report Error");
        } finally {
            this.state.loading = false;
        }
    }

    // ── Event handlers ────────────────────────────────────────────────────

    async onReportSelect(reportTypeId) {
        this.state.selectedReportType = reportTypeId;
        this.state.drilldownOpen = false;
        // Load saved configs for this type
        this.state.savedConfigs = await this.fh.getSavedConfigs(reportTypeId);
        await this._runReport();
    }

    async onFiltersChange(newFilters) {
        Object.assign(this.state.filters, newFilters);
        await this._runReport();
    }

    async onRowDrilldown({ rowKey, label }) {
        this.state.drilldownRowKey = rowKey;
        this.state.drilldownTitle = label;
        this.state.drilldownOpen = true;
    }

    onDrilldownClose() {
        this.state.drilldownOpen = false;
        this.state.drilldownRowKey = null;
    }

    async onLoadSavedConfig(config) {
        try {
            const payload = JSON.parse(config.filter_payload || "{}");
            Object.assign(this.state.filters, payload);
            await this._runReport();
            await this.fh.touchConfig(config.id);
        } catch (e) {
            this.fh.notifyError("Failed to load saved config: " + e.message);
        }
    }

    onSaveConfig() {
        this.state.saveModalOpen = true;
    }

    async onSaveConfigConfirm(vals) {
        try {
            vals.report_type = this.state.selectedReportType;
            vals.filter_payload = JSON.stringify(this.state.filters);
            await this.fh.saveConfig(vals);
            this.fh.notifySuccess("Report configuration saved.");
            this.state.savedConfigs = await this.fh.getSavedConfigs(this.state.selectedReportType);
        } catch (e) {
            this.fh.notifyError(e.message);
        } finally {
            this.state.saveModalOpen = false;
        }
    }

    onSaveConfigCancel() {
        this.state.saveModalOpen = false;
    }

    onExportPdf() {
        this.fh.exportPdf(this.state.selectedReportType, this.state.filters);
    }

    onExportXlsx() {
        this.fh.exportXlsx(this.state.selectedReportType, this.state.filters);
    }

    // ── Computed helpers ──────────────────────────────────────────────────

    get selectedReportDef() {
        return this.state.reportTypes.find(r => r.id === this.state.selectedReportType) || null;
    }

    get reportTitle() {
        return this.state.reportData?.title || this.selectedReportDef?.label || "Report";
    }
}

registry.category("actions").add("financehub_reports", FinancehubReports);
