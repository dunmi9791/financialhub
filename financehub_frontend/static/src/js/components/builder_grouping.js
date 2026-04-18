/** @odoo-module **/
/**
 * BuilderGrouping Component
 * ==========================
 * Step 4: configure grouping, aggregations, and simple computed fields.
 *
 * Props:
 *   baseModel  {String}
 *   groupby    {Array}   Currently selected group-by fields
 *   computed   {Array}   [{name, formula, label}]
 *   columns    {Array}   Selected columns (for aggregate choices)
 *   onUpdate   {Function({ groupby, computed })}
 */

import { Component, useState } from "@odoo/owl";

const GROUPABLE_FIELDS = {
    "account.move.line": [
        { name: "account_id", label: "Account" },
        { name: "partner_id", label: "Partner" },
        { name: "journal_id", label: "Journal" },
        { name: "date",       label: "Date" },
        { name: "name",       label: "Label" },
    ],
    "account.move": [
        { name: "journal_id",  label: "Journal" },
        { name: "partner_id",  label: "Partner" },
        { name: "date",        label: "Date" },
        { name: "state",       label: "Status" },
    ],
    "account.account": [
        { name: "account_type", label: "Account Type" },
    ],
    "res.partner": [
        { name: "customer_rank", label: "Customer Rank" },
    ],
    "account.analytic.line": [
        { name: "account_id", label: "Analytic Account" },
        { name: "partner_id", label: "Partner" },
        { name: "date",       label: "Date" },
    ],
};

export class BuilderGrouping extends Component {
    static template = "financehub.BuilderGrouping";
    static props = {
        baseModel: { type: String },
        groupby: { type: Array },
        computed: { type: Array },
        columns: { type: Array },
        onUpdate: { type: Function },
    };

    setup() {
        this.state = useState({
            groupby: [...(this.props.groupby || [])],
            computed: (this.props.computed || []).map(c => ({ ...c })),
        });
    }

    get groupableFields() {
        return GROUPABLE_FIELDS[this.props.baseModel] || [];
    }

    get monetaryColumns() {
        return (this.props.columns || []).filter(c => c.type === "monetary" || c.aggregate);
    }

    // ── Groupby ───────────────────────────────────────────────────────────

    isGrouped(fieldName) {
        return this.state.groupby.includes(fieldName);
    }

    toggleGroupby(fieldName) {
        const idx = this.state.groupby.indexOf(fieldName);
        if (idx >= 0) {
            this.state.groupby.splice(idx, 1);
        } else {
            this.state.groupby.push(fieldName);
        }
        this._emit();
    }

    moveGroupUp(index) {
        if (index > 0) {
            [this.state.groupby[index - 1], this.state.groupby[index]] =
                [this.state.groupby[index], this.state.groupby[index - 1]];
            this._emit();
        }
    }

    moveGroupDown(index) {
        if (index < this.state.groupby.length - 1) {
            [this.state.groupby[index + 1], this.state.groupby[index]] =
                [this.state.groupby[index], this.state.groupby[index + 1]];
            this._emit();
        }
    }

    // ── Computed fields ───────────────────────────────────────────────────

    addComputed() {
        this.state.computed.push({ name: `computed_${Date.now()}`, label: "New Field", formula: "debit - credit" });
        this._emit();
    }

    removeComputed(index) {
        this.state.computed.splice(index, 1);
        this._emit();
    }

    onComputedNameChange(index, ev) {
        this.state.computed[index].name = ev.target.value.replace(/\s+/g, "_").toLowerCase();
        this._emit();
    }

    onComputedLabelChange(index, ev) {
        this.state.computed[index].label = ev.target.value;
        this._emit();
    }

    onComputedFormulaChange(index, ev) {
        this.state.computed[index].formula = ev.target.value;
        this._emit();
    }

    _emit() {
        this.props.onUpdate({
            groupby: [...this.state.groupby],
            computed: this.state.computed.map(c => ({ ...c })),
        });
    }
}
