/** @odoo-module **/
/**
 * BuilderColumns Component
 * =========================
 * Step 3: choose and configure report columns.
 *
 * Props:
 *   baseModel  {String}
 *   columns    {Array}   [{field, label, type, aggregate, format}]
 *   onUpdate   {Function(columns)}
 */

import { Component, useState } from "@odoo/owl";

const FORMAT_OPTIONS = [
    { id: "default",  label: "Default" },
    { id: "monetary", label: "Currency (2 dp)" },
    { id: "integer",  label: "Integer" },
    { id: "percent",  label: "Percentage" },
    { id: "date",     label: "Date (YYYY-MM-DD)" },
    { id: "text",     label: "Text" },
];

// Subset of MODEL_FIELDS from builder_filters.js duplicated here for self-containment
const MODEL_FIELDS = {
    "account.move.line": [
        { name: "date",       string: "Date",      ttype: "date" },
        { name: "name",       string: "Label",     ttype: "char" },
        { name: "account_id", string: "Account",   ttype: "many2one" },
        { name: "partner_id", string: "Partner",   ttype: "many2one" },
        { name: "journal_id", string: "Journal",   ttype: "many2one" },
        { name: "debit",      string: "Debit",     ttype: "monetary" },
        { name: "credit",     string: "Credit",    ttype: "monetary" },
        { name: "balance",    string: "Balance",   ttype: "monetary" },
        { name: "ref",        string: "Reference", ttype: "char" },
    ],
    "account.move": [
        { name: "name",          string: "Reference",    ttype: "char" },
        { name: "date",          string: "Date",         ttype: "date" },
        { name: "journal_id",    string: "Journal",      ttype: "many2one" },
        { name: "partner_id",    string: "Partner",      ttype: "many2one" },
        { name: "amount_total",  string: "Total Amount", ttype: "monetary" },
        { name: "state",         string: "Status",       ttype: "selection" },
    ],
    "account.account": [
        { name: "code",         string: "Code",    ttype: "char" },
        { name: "name",         string: "Name",    ttype: "char" },
        { name: "account_type", string: "Type",    ttype: "selection" },
    ],
    "res.partner": [
        { name: "name",  string: "Name",  ttype: "char" },
        { name: "email", string: "Email", ttype: "char" },
    ],
    "account.analytic.line": [
        { name: "date",       string: "Date",   ttype: "date" },
        { name: "name",       string: "Label",  ttype: "char" },
        { name: "amount",     string: "Amount", ttype: "monetary" },
        { name: "account_id", string: "Analytic Account", ttype: "many2one" },
    ],
};

export class BuilderColumns extends Component {
    static template = "financehub.BuilderColumns";
    static props = {
        baseModel: { type: String },
        columns: { type: Array },
        onUpdate: { type: Function },
    };

    setup() {
        this.state = useState({
            cols: this.props.columns.map(c => ({ ...c })),
        });
    }

    get availableFields() {
        const used = new Set(this.state.cols.map(c => c.field));
        return (MODEL_FIELDS[this.props.baseModel] || []).filter(f => !used.has(f.name));
    }

    get formatOptions() {
        return FORMAT_OPTIONS;
    }

    addColumn(fieldName) {
        const fields = MODEL_FIELDS[this.props.baseModel] || [];
        const fdef = fields.find(f => f.name === fieldName);
        this.state.cols.push({
            field: fieldName,
            label: fdef?.string || fieldName,
            type: fdef?.ttype === "monetary" ? "monetary" : fdef?.ttype || "text",
            aggregate: fdef?.ttype === "monetary",
            format: fdef?.ttype === "monetary" ? "monetary" : "default",
        });
        this._emit();
    }

    removeColumn(index) {
        this.state.cols.splice(index, 1);
        this._emit();
    }

    moveUp(index) {
        if (index > 0) {
            const tmp = this.state.cols[index - 1];
            this.state.cols[index - 1] = this.state.cols[index];
            this.state.cols[index] = tmp;
            this._emit();
        }
    }

    moveDown(index) {
        if (index < this.state.cols.length - 1) {
            const tmp = this.state.cols[index + 1];
            this.state.cols[index + 1] = this.state.cols[index];
            this.state.cols[index] = tmp;
            this._emit();
        }
    }

    onLabelChange(index, ev) {
        this.state.cols[index].label = ev.target.value;
        this._emit();
    }

    onFormatChange(index, ev) {
        this.state.cols[index].format = ev.target.value;
        this.state.cols[index].type = ev.target.value === "monetary" ? "monetary"
            : ev.target.value === "integer" ? "integer"
            : ev.target.value === "date" ? "date" : "text";
        this._emit();
    }

    onAggregateChange(index, ev) {
        this.state.cols[index].aggregate = ev.target.checked;
        this._emit();
    }

    _emit() {
        this.props.onUpdate(this.state.cols.map(c => ({ ...c })));
    }

    onAddField(ev) {
        if (ev.target.value) {
            this.addColumn(ev.target.value);
            ev.target.value = "";
        }
    }
}
