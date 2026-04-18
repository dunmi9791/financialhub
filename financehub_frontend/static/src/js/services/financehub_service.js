/** @odoo-module **/
/**
 * FinanceHub Service
 * ==================
 * Central service that wraps all backend HTTP calls and ORM calls for
 * FinanceHub components.  Registered as "financehub" in the services registry
 * so any OWL component can grab it with useService("financehub").
 *
 * Design: thin RPC wrapper with error normalisation.  All methods return
 * Promises that resolve to the `data` field of the JSON response, or reject
 * with an {Error} that has a human-readable .message.
 */

import { registry } from "@web/core/registry";

// ─── helpers ────────────────────────────────────────────────────────────────

async function fetchJson(url, options = {}) {
    const defaults = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
    };
    const response = await fetch(url, { ...defaults, ...options });
    const json = await response.json();
    if (json.status === "error") {
        const err = new Error(json.message || "FinanceHub backend error");
        err.code = response.status;
        throw err;
    }
    return json.data;
}

function postJson(url, body) {
    return fetchJson(url, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

function getJson(url) {
    return fetchJson(url, { method: "GET" });
}

// ─── service factory ─────────────────────────────────────────────────────────

function makeFinancehubService({ orm, notification }) {

    // ── Report types ──────────────────────────────────────────────────────

    async function getReportTypes() {
        return getJson("/financehub/reports/types");
    }

    // ── Run / drilldown ───────────────────────────────────────────────────

    async function runReport(reportType, filters) {
        return postJson("/financehub/reports/run", {
            report_type: reportType,
            filters,
        });
    }

    async function drilldown(rowKey, filters, page = 1, pageSize = 50) {
        return postJson("/financehub/reports/drilldown", {
            row_key: rowKey,
            filters,
            page,
            page_size: pageSize,
        });
    }

    // ── Exports ───────────────────────────────────────────────────────────

    function exportPdf(reportType, filters) {
        // Trigger a file download via a POST form submission
        _submitDownload("/financehub/reports/export_pdf", { report_type: reportType, filters });
    }

    function exportXlsx(reportType, filters) {
        _submitDownload("/financehub/reports/export_xlsx", { report_type: reportType, filters });
    }

    function _submitDownload(url, body) {
        // Use a hidden form to POST and trigger file download
        const form = document.createElement("form");
        form.method = "POST";
        form.action = url;
        form.style.display = "none";
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "data";
        input.value = JSON.stringify(body);
        form.appendChild(input);
        // Add CSRF token
        const csrf = document.createElement("input");
        csrf.type = "hidden";
        csrf.name = "csrf_token";
        csrf.value = odoo.csrf_token || "";
        form.appendChild(csrf);
        document.body.appendChild(form);
        form.submit();
        document.body.removeChild(form);
    }

    // ── Saved configs ─────────────────────────────────────────────────────

    async function getSavedConfigs(reportType) {
        return orm.call("financehub.saved.config", "get_configs_for_report", [reportType]);
    }

    async function saveConfig(vals) {
        return orm.call("financehub.saved.config", "save_config", [vals]);
    }

    async function deleteConfig(configId) {
        return orm.unlink("financehub.saved.config", [configId]);
    }

    async function touchConfig(configId) {
        return orm.call("financehub.saved.config", "touch_last_used", [configId]);
    }

    // ── Report definitions ────────────────────────────────────────────────

    async function listReportDefinitions() {
        return orm.call("financehub.report.definition", "list_definitions", []);
    }

    async function upsertReportDefinition(vals) {
        return orm.call("financehub.report.definition", "upsert_definition", [vals]);
    }

    async function deleteReportDefinition(defId) {
        return orm.unlink("financehub.report.definition", [defId]);
    }

    // ── Bank reconciliation ───────────────────────────────────────────────

    async function getStatementLines(filters) {
        return postJson("/financehub/bank/statement_lines", filters);
    }

    async function getMatchSuggestions(lineId) {
        return postJson("/financehub/bank/match_suggestions", { line_id: lineId });
    }

    async function reconcile(actionPayload) {
        return postJson("/financehub/bank/reconcile", actionPayload);
    }

    async function getAuditLog(lineId) {
        return postJson("/financehub/bank/audit_log", { line_id: lineId });
    }

    // ── Dashboard ─────────────────────────────────────────────────────────

    async function getDashboardKpis() {
        return getJson("/financehub/dashboard/kpis");
    }

    // ── Odoo helper data ──────────────────────────────────────────────────

    async function getJournals(companyId) {
        return orm.searchRead(
            "account.journal",
            [["company_id", "=", companyId || false]],
            ["id", "name", "type", "code"],
            { order: "name asc" }
        );
    }

    async function getCompanies() {
        return orm.searchRead(
            "res.company",
            [["id", "in", "context.allowed_company_ids"]],
            ["id", "name", "currency_id"],
            {}
        );
    }

    async function getAnalyticAccounts() {
        return orm.searchRead(
            "account.analytic.account",
            [],
            ["id", "name", "code"],
            { order: "name asc", limit: 200 }
        );
    }

    async function getAccounts(companyId) {
        return orm.searchRead(
            "account.account",
            [["company_id", "=", companyId || false], ["deprecated", "=", false]],
            ["id", "name", "code", "account_type"],
            { order: "code asc", limit: 500 }
        );
    }

    async function getPartners() {
        return orm.searchRead(
            "res.partner",
            [["active", "=", true]],
            ["id", "name"],
            { order: "name asc", limit: 300 }
        );
    }

    // ── Notification helpers ──────────────────────────────────────────────

    function notifyError(message, title = "FinanceHub Error") {
        notification.add(message, { title, type: "danger", sticky: false });
    }

    function notifySuccess(message) {
        notification.add(message, { type: "success", sticky: false });
    }

    // ── Public API ────────────────────────────────────────────────────────

    return {
        // Reports
        getReportTypes,
        runReport,
        drilldown,
        exportPdf,
        exportXlsx,
        // Saved configs
        getSavedConfigs,
        saveConfig,
        deleteConfig,
        touchConfig,
        // Report builder
        listReportDefinitions,
        upsertReportDefinition,
        deleteReportDefinition,
        // Bank reconciliation
        getStatementLines,
        getMatchSuggestions,
        reconcile,
        getAuditLog,
        // Dashboard
        getDashboardKpis,
        // Odoo data helpers
        getJournals,
        getCompanies,
        getAnalyticAccounts,
        getAccounts,
        getPartners,
        // Notifications
        notifyError,
        notifySuccess,
    };
}

// ─── registration ─────────────────────────────────────────────────────────────

registry.category("services").add("financehub", {
    dependencies: ["orm", "notification"],
    start(env, { orm, notification }) {
        return makeFinancehubService({ orm, notification });
    },
});
