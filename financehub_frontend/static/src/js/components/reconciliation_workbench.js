/** @odoo-module **/
/**
 * ReconciliationWorkbench
 * ========================
 * Master component for the bank reconciliation workspace.
 * Left panel: statement lines list
 * Right panel: matching panel for selected line
 */

import { Component, useState, onWillStart } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { StatementLinesList } from "./statement_lines_list";
import { MatchCandidatesPanel } from "./match_candidates_panel";

const STATUS_OPTIONS = [
    { id: "all", label: "All Lines" },
    { id: "unreconciled", label: "Unreconciled" },
    { id: "reconciled", label: "Reconciled" },
];

export class ReconciliationWorkbench extends Component {
    static template = "financehub.ReconciliationWorkbench";
    static props = {};
    static components = { StatementLinesList, MatchCandidatesPanel };

    setup() {
        this.fh = useService("financehub");

        this.state = useState({
            // Filters for statement lines
            filters: {
                status: "unreconciled",
                date_from: null,
                date_to: null,
                journal_ids: [],
                search: "",
                page: 1,
                page_size: 50,
            },
            // Statement lines data
            linesData: { lines: [], total: 0, page: 1, pages: 1 },
            loadingLines: false,

            // Selected line
            selectedLineId: null,
            selectedLine: null,

            // Journals for filter dropdown
            journals: [],

            // Audit log
            auditLog: [],
            showAuditLog: false,

            // Batch reconcile state
            batchSelected: [],
            batchLoading: false,
        });

        onWillStart(async () => {
            await this._loadData();
        });
    }

    async _loadData() {
        this.state.loadingLines = true;
        try {
            [this.state.linesData, this.state.journals] = await Promise.all([
                this.fh.getStatementLines(this.state.filters),
                this.fh.getJournals(null),
            ]);
        } catch (e) {
            this.fh.notifyError(e.message, "Reconciliation Error");
        } finally {
            this.state.loadingLines = false;
        }
    }

    // ── Line selection ────────────────────────────────────────────────────

    async onLineSelect(line) {
        this.state.selectedLineId = line.id;
        this.state.selectedLine = line;
        this.state.showAuditLog = false;
        // Audit log is loaded on demand
    }

    async onShowAuditLog() {
        if (!this.state.selectedLineId) return;
        try {
            const data = await this.fh.getAuditLog(this.state.selectedLineId);
            this.state.auditLog = data.notes;
            this.state.showAuditLog = true;
        } catch (e) {
            this.fh.notifyError(e.message);
        }
    }

    onHideAuditLog() {
        this.state.showAuditLog = false;
    }

    // ── Reconciliation actions ────────────────────────────────────────────

    async onReconcileAction(actionPayload) {
        try {
            await this.fh.reconcile(actionPayload);
            this.fh.notifySuccess("Reconciliation applied successfully.");
            // Refresh lines and deselect
            this.state.selectedLineId = null;
            this.state.selectedLine = null;
            await this._loadData();
        } catch (e) {
            this.fh.notifyError(e.message, "Reconciliation Error");
        }
    }

    // ── Filter handlers ───────────────────────────────────────────────────

    async onFilterChange(patch) {
        Object.assign(this.state.filters, patch, { page: 1 });
        await this._loadData();
    }

    async onPageChange(page) {
        this.state.filters.page = page;
        await this._loadData();
    }

    // ── Batch reconcile ───────────────────────────────────────────────────

    toggleBatchSelect(lineId) {
        const idx = this.state.batchSelected.indexOf(lineId);
        if (idx >= 0) {
            this.state.batchSelected.splice(idx, 1);
        } else {
            this.state.batchSelected.push(lineId);
        }
    }

    async onBatchAutoReconcile() {
        if (!this.state.batchSelected.length) {
            this.fh.notifyError("Select at least one line.");
            return;
        }
        this.state.batchLoading = true;
        let successCount = 0;
        for (const lineId of this.state.batchSelected) {
            try {
                const suggestions = await this.fh.getMatchSuggestions(lineId);
                const best = suggestions.suggestions?.[0];
                if (best && best.score >= 90) {
                    await this.fh.reconcile({
                        action: "match",
                        line_id: lineId,
                        match_type: best.type,
                        match_id: best.id,
                    });
                    successCount++;
                }
            } catch (e) {
                // Skip failed lines in batch
            }
        }
        this.state.batchSelected = [];
        this.state.batchLoading = false;
        this.fh.notifySuccess(`Auto-reconciled ${successCount} lines.`);
        await this._loadData();
    }

    get statusOptions() {
        return STATUS_OPTIONS;
    }

    isLineSelected(lineId) {
        return this.state.selectedLineId === lineId;
    }

    isBatchChecked(lineId) {
        return this.state.batchSelected.includes(lineId);
    }
}
