/** @odoo-module **/
/**
 * StatementLinesList Component
 * =============================
 * Renders the left-panel list of bank statement lines.
 *
 * Props:
 *   linesData         {Object}  { lines, total, page, pages }
 *   loading           {Boolean}
 *   filters           {Object}
 *   journals          {Array}
 *   selectedLineId    {Number|null}
 *   batchSelected     {Array}
 *   statusOptions     {Array}
 *   onLineSelect      {Function}
 *   onFilterChange    {Function}
 *   onPageChange      {Function}
 *   onToggleBatch     {Function}
 *   onBatchReconcile  {Function}
 *   batchLoading      {Boolean}
 */

import { Component } from "@odoo/owl";

export class StatementLinesList extends Component {
    static template = "financehub.StatementLinesList";
    static props = {
        linesData: { type: Object },
        loading: { type: Boolean, optional: true },
        filters: { type: Object },
        journals: { type: Array },
        selectedLineId: { optional: true },
        batchSelected: { type: Array },
        statusOptions: { type: Array },
        onLineSelect: { type: Function },
        onFilterChange: { type: Function },
        onPageChange: { type: Function },
        onToggleBatch: { type: Function },
        onBatchReconcile: { type: Function },
        batchLoading: { type: Boolean, optional: true },
    };

    get lines() {
        return this.props.linesData?.lines || [];
    }

    get total() {
        return this.props.linesData?.total || 0;
    }

    get page() {
        return this.props.linesData?.page || 1;
    }

    get pages() {
        return this.props.linesData?.pages || 1;
    }

    isSelected(lineId) {
        return this.props.selectedLineId === lineId;
    }

    isBatchChecked(lineId) {
        return this.props.batchSelected.includes(lineId);
    }

    onSelect(line, ev) {
        // If clicking the checkbox, don't also select the row (batch mode)
        if (ev?.target?.type === "checkbox") return;
        this.props.onLineSelect(line);
    }

    onCheckbox(lineId, ev) {
        ev.stopPropagation();
        this.props.onToggleBatch(lineId);
    }

    onSearchInput(ev) {
        this.props.onFilterChange({ search: ev.target.value });
    }

    onStatusChange(ev) {
        this.props.onFilterChange({ status: ev.target.value });
    }

    onJournalChange(ev) {
        const val = parseInt(ev.target.value);
        this.props.onFilterChange({ journal_ids: val ? [val] : [] });
    }

    onDateFromChange(ev) {
        this.props.onFilterChange({ date_from: ev.target.value || null });
    }

    onDateToChange(ev) {
        this.props.onFilterChange({ date_to: ev.target.value || null });
    }

    lineClass(line) {
        const classes = ["fh-st-line"];
        if (this.isSelected(line.id)) classes.push("fh-st-line--selected");
        if (line.is_reconciled) classes.push("fh-st-line--reconciled");
        else classes.push("fh-st-line--unreconciled");
        return classes.join(" ");
    }

    amountClass(amount) {
        return parseFloat(amount) >= 0 ? "fh-amount--positive" : "fh-amount--negative";
    }

    formatAmount(val) {
        const num = parseFloat(val);
        if (isNaN(num)) return "—";
        return Math.abs(num).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    get pageNumbers() {
        const pages = [];
        const { page, pages: total } = this;
        for (let i = Math.max(1, page - 2); i <= Math.min(total, page + 2); i++) {
            pages.push(i);
        }
        return pages;
    }

    get hasBatchSelected() {
        return this.props.batchSelected.length > 0;
    }
}
