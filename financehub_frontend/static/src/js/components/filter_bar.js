/** @odoo-module **/
/**
 * FilterBar Component
 * ====================
 * Reusable top filter bar for financial reports.
 * Emits "filters-change" with the updated filter payload whenever
 * the user changes any filter.
 *
 * Props:
 *   filters    {Object}  Current filter state (two-way via event)
 *   reportDef  {Object}  The report type definition (controls which filters show)
 *
 * Events:
 *   filters-change  {filters}  Complete updated filter object
 */

import { Component, useState, onWillStart } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";
import { session } from "@web/session";

const DATE_PRESETS = [
    { id: "this_month",  label: "This Month" },
    { id: "last_month",  label: "Last Month" },
    { id: "ytd",         label: "Year to Date" },
    { id: "last_year",   label: "Last Year" },
    { id: "fy",          label: "Fiscal Year" },
    { id: "custom",      label: "Custom" },
];

const COMPARE_MODES = [
    { id: null,           label: "No comparison" },
    { id: "prev_period",  label: "Previous period" },
    { id: "last_year",    label: "Same period last year" },
];

function getPresetDates(preset) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    switch (preset) {
        case "this_month":
            return {
                date_from: new Date(y, m, 1).toISOString().slice(0, 10),
                date_to: new Date(y, m + 1, 0).toISOString().slice(0, 10),
            };
        case "last_month":
            return {
                date_from: new Date(y, m - 1, 1).toISOString().slice(0, 10),
                date_to: new Date(y, m, 0).toISOString().slice(0, 10),
            };
        case "ytd":
            return {
                date_from: `${y}-01-01`,
                date_to: now.toISOString().slice(0, 10),
            };
        case "last_year":
            return {
                date_from: `${y - 1}-01-01`,
                date_to: `${y - 1}-12-31`,
            };
        case "fy":
            // Assuming FY = calendar year; override per company if needed
            return {
                date_from: `${y}-01-01`,
                date_to: `${y}-12-31`,
            };
        default:
            return {};
    }
}

export class FilterBar extends Component {
    static template = "financehub.FilterBar";
    static props = {
        filters: { type: Object },
        reportDef: { type: Object, optional: true },
    };

    setup() {
        this.fh = useService("financehub");

        this.state = useState({
            journals: [],
            companies: [],
            analytics: [],
            showAdvanced: false,
        });

        onWillStart(async () => {
            await this._loadData();
        });
    }

    async _loadData() {
        try {
            const allowedIds = session.user_context?.allowed_company_ids || [];
            const [journals, analytics, companies] = await Promise.all([
                this.fh.getJournals(),
                this.fh.getAnalyticAccounts(),
                allowedIds.length > 1 ? this.fh.getCompanies() : Promise.resolve([]),
            ]);
            this.state.journals = journals;
            this.state.analytics = analytics;
            this.state.companies = companies;
        } catch (e) {
            // Non-critical; filter bar degrades gracefully
        }
    }

    get datePresets() {
        return DATE_PRESETS;
    }

    get compareModes() {
        return COMPARE_MODES;
    }

    get supportsAnalytic() {
        return this.props.reportDef?.supports_analytic !== false;
    }

    get supportsCompare() {
        return this.props.reportDef?.supports_compare !== false;
    }

    // ── Event handlers ────────────────────────────────────────────────────

    onPresetChange(ev) {
        const preset = ev.target.value;
        const dates = getPresetDates(preset);
        this._emit({ date_preset: preset, ...dates });
    }

    onDateFromChange(ev) {
        this._emit({ date_from: ev.target.value, date_preset: "custom" });
    }

    onDateToChange(ev) {
        this._emit({ date_to: ev.target.value, date_preset: "custom" });
    }

    onJournalToggle(journalId) {
        const current = this.props.filters.journal_ids || [];
        const updated = current.includes(journalId)
            ? current.filter(id => id !== journalId)
            : [...current, journalId];
        this._emit({ journal_ids: updated });
    }

    onAnalyticToggle(analyticId) {
        const current = this.props.filters.analytic_ids || [];
        const updated = current.includes(analyticId)
            ? current.filter(id => id !== analyticId)
            : [...current, analyticId];
        this._emit({ analytic_ids: updated });
    }

    onCompareModeChange(ev) {
        this._emit({ compare_mode: ev.target.value || null });
    }

    onCompanyChange(ev) {
        const val = parseInt(ev.target.value);
        this._emit({ company_ids: val ? [val] : [] });
    }

    toggleAdvanced() {
        this.state.showAdvanced = !this.state.showAdvanced;
    }

    onClearAllFilters() {
        const today = new Date().toISOString().slice(0, 10);
        this._emit({
            date_preset: "ytd",
            date_from: `${new Date().getFullYear()}-01-01`,
            date_to: today,
            journal_ids: [],
            analytic_ids: [],
            partner_ids: [],
            account_ids: [],
            compare_mode: null,
        });
    }

    _emit(patch) {
        const updated = { ...this.props.filters, ...patch };
        this.props.onFiltersChange(updated);
    }

    isJournalSelected(journalId) {
        return (this.props.filters.journal_ids || []).includes(journalId);
    }

    isAnalyticSelected(analyticId) {
        return (this.props.filters.analytic_ids || []).includes(analyticId);
    }

    activeFilterCount() {
        const f = this.props.filters;
        let count = 0;
        if (f.journal_ids?.length) count += f.journal_ids.length;
        if (f.analytic_ids?.length) count += f.analytic_ids.length;
        if (f.compare_mode) count++;
        return count;
    }
}
