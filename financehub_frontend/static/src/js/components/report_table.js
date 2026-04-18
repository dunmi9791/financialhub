/** @odoo-module **/
/**
 * ReportTable Component
 * ======================
 * Renders a hierarchical report result set.
 * Supports:
 *  - Fold / unfold sections (for Balance Sheet, P&L)
 *  - Totals row pinned at bottom
 *  - Click on a data row → emits "row-drilldown"
 *  - Currency / number formatting
 *
 * Props:
 *   reportData  {Object}  Response from runReport()
 *   loading     {Boolean}
 *   error       {String|null}
 *
 * Events:
 *   row-drilldown  {rowKey, label}
 */

import { Component, useState } from "@odoo/owl";

function formatMoney(value, decimals = 2) {
    if (value === null || value === undefined || value === "") return "";
    const num = parseFloat(value);
    if (isNaN(num)) return String(value);
    const abs = Math.abs(num);
    const fmt = abs.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
    return num < 0 ? `(${fmt})` : fmt;
}

function formatCell(value, colType) {
    if (value === null || value === undefined || value === "") return "";
    switch (colType) {
        case "monetary": return formatMoney(value);
        case "date": return value ? String(value).slice(0, 10) : "";
        case "integer": return parseInt(value).toLocaleString("en-US");
        default: return String(value);
    }
}

export class ReportTable extends Component {
    static template = "financehub.ReportTable";
    static props = {
        reportData: { optional: true },
        loading: { type: Boolean, optional: true },
        error: { type: String, optional: true },
        onRowDrilldown: { type: Function, optional: true },
    };

    setup() {
        // Track collapsed sections by row_key
        this.state = useState({
            collapsed: {},   // { [row_key]: true }
        });
    }

    // ── Computed helpers ──────────────────────────────────────────────────

    get columns() {
        return this.props.reportData?.columns || [];
    }

    get rows() {
        return this.props.reportData?.rows || [];
    }

    get totals() {
        return this.props.reportData?.totals || null;
    }

    get title() {
        return this.props.reportData?.title || "";
    }

    // ── Row rendering ─────────────────────────────────────────────────────

    /**
     * Returns a flat list of visible rows (respecting collapsed state).
     * Each item has: row, depth, isVisible
     */
    get flatRows() {
        const result = [];
        const flatten = (rows, depth) => {
            for (const row of rows) {
                result.push({ row, depth });
                const collapsed = this.state.collapsed[row.row_key];
                if (!collapsed && row.children?.length) {
                    flatten(row.children, depth + 1);
                }
            }
        };
        flatten(this.rows, 0);
        return result;
    }

    isCollapsed(rowKey) {
        return !!this.state.collapsed[rowKey];
    }

    toggleCollapse(rowKey) {
        this.state.collapsed[rowKey] = !this.state.collapsed[rowKey];
    }

    expandAll() {
        this.state.collapsed = {};
    }

    collapseAll() {
        const collapsed = {};
        const mark = (rows) => {
            for (const row of rows) {
                if (row.children?.length) {
                    collapsed[row.row_key] = true;
                    mark(row.children);
                }
            }
        };
        mark(this.rows);
        this.state.collapsed = collapsed;
    }

    // ── Value formatting ──────────────────────────────────────────────────

    cellValue(row, column) {
        return formatCell(row.values?.[column.field], column.type);
    }

    totalValue(column) {
        return formatCell(this.totals?.values?.[column.field], column.type);
    }

    cellClass(row, column) {
        const val = row.values?.[column.field];
        if (column.type !== "monetary") return "";
        const num = parseFloat(val);
        if (isNaN(num)) return "";
        return num < 0 ? "fh-cell--negative" : num > 0 ? "fh-cell--positive" : "";
    }

    rowClass(row, depth) {
        const classes = [`fh-row--depth-${Math.min(depth, 4)}`];
        if (row.is_section) classes.push("fh-row--section");
        if (row.expandable && row.children?.length) classes.push("fh-row--expandable");
        return classes.join(" ");
    }

    // ── Drilldown ─────────────────────────────────────────────────────────

    onRowClick(row) {
        if (this.props.onRowDrilldown && row.expandable) {
            this.props.onRowDrilldown({ rowKey: row.row_key, label: row.label });
        }
    }

    // ── Column alignment ──────────────────────────────────────────────────

    colAlign(column) {
        if (column.type === "monetary" || column.type === "integer") return "right";
        if (column.type === "date") return "center";
        return "left";
    }
}
