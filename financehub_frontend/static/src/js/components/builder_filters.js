/** @odoo-module **/
/**
 * BuilderFilters Component
 * =========================
 * Step 2 of the report builder: add filter conditions.
 * Each condition is { field, operator, value }.
 *
 * Props:
 *   baseModel    {String}
 *   filters      {Array}   Current filters
 *   onUpdate     {Function(filters)}
 */

import { Component, useState } from "@odoo/owl";

// Operator options per field type
const OPERATORS = {
    char:     [{ id: "=", l: "equals" }, { id: "ilike", l: "contains" }, { id: "!=", l: "not equals" }],
    text:     [{ id: "ilike", l: "contains" }, { id: "=", l: "equals" }],
    integer:  [{ id: "=", l: "=" }, { id: "!=", l: "≠" }, { id: ">", l: ">" }, { id: "<", l: "<" }, { id: ">=", l: "≥" }, { id: "<=", l: "≤" }],
    float:    [{ id: "=", l: "=" }, { id: "!=", l: "≠" }, { id: ">", l: ">" }, { id: "<", l: "<" }],
    monetary: [{ id: "=", l: "=" }, { id: "!=", l: "≠" }, { id: ">", l: ">" }, { id: "<", l: "<" }],
    date:     [{ id: ">=", l: "on or after" }, { id: "<=", l: "on or before" }, { id: "=", l: "on" }],
    boolean:  [{ id: "=", l: "is" }],
    many2one: [{ id: "=", l: "is" }, { id: "!=", l: "is not" }],
    selection:[{ id: "=", l: "is" }, { id: "!=", l: "is not" }],
};

// Well-known fields by model (a real implementation would call fields_get)
const MODEL_FIELDS = {
    "account.move.line": [
        { name: "date",          string: "Date",         ttype: "date" },
        { name: "name",          string: "Label",        ttype: "char" },
        { name: "account_id",    string: "Account",      ttype: "many2one" },
        { name: "partner_id",    string: "Partner",      ttype: "many2one" },
        { name: "journal_id",    string: "Journal",      ttype: "many2one" },
        { name: "debit",         string: "Debit",        ttype: "monetary" },
        { name: "credit",        string: "Credit",       ttype: "monetary" },
        { name: "balance",       string: "Balance",      ttype: "monetary" },
        { name: "reconciled",    string: "Reconciled",   ttype: "boolean" },
        { name: "ref",           string: "Reference",    ttype: "char" },
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
        { name: "code",          string: "Code",         ttype: "char" },
        { name: "name",          string: "Name",         ttype: "char" },
        { name: "account_type",  string: "Type",         ttype: "selection" },
        { name: "deprecated",    string: "Deprecated",   ttype: "boolean" },
    ],
    "res.partner": [
        { name: "name",          string: "Name",         ttype: "char" },
        { name: "email",         string: "Email",        ttype: "char" },
        { name: "customer_rank", string: "Customer Rank", ttype: "integer" },
        { name: "supplier_rank", string: "Supplier Rank", ttype: "integer" },
    ],
    "account.analytic.line": [
        { name: "date",          string: "Date",         ttype: "date" },
        { name: "name",          string: "Label",        ttype: "char" },
        { name: "amount",        string: "Amount",       ttype: "monetary" },
        { name: "account_id",    string: "Analytic Account", ttype: "many2one" },
        { name: "partner_id",    string: "Partner",      ttype: "many2one" },
    ],
};

export class BuilderFilters extends Component {
    static template = "financehub.BuilderFilters";
    static props = {
        baseModel: { type: String },
        filters: { type: Array },
        onUpdate: { type: Function },
    };

    setup() {
        this.state = useState({
            // Working copy
            conditions: [...(this.props.filters || [])],
        });
    }

    get availableFields() {
        return MODEL_FIELDS[this.props.baseModel] || [];
    }

    get fieldsByName() {
        const map = {};
        for (const f of this.availableFields) map[f.name] = f;
        return map;
    }

    operatorsFor(fieldName) {
        const field = this.fieldsByName[fieldName];
        if (!field) return OPERATORS.char;
        return OPERATORS[field.ttype] || OPERATORS.char;
    }

    inputTypeFor(fieldName) {
        const field = this.fieldsByName[fieldName];
        if (!field) return "text";
        switch (field.ttype) {
            case "date": return "date";
            case "integer": case "float": case "monetary": return "number";
            case "boolean": return "checkbox";
            default: return "text";
        }
    }

    // ── Condition management ──────────────────────────────────────────────

    addCondition() {
        const firstField = this.availableFields[0];
        this.state.conditions.push({
            field: firstField?.name || "",
            operator: "=",
            value: "",
        });
        this._emit();
    }

    removeCondition(index) {
        this.state.conditions.splice(index, 1);
        this._emit();
    }

    onFieldChange(index, ev) {
        const field = this.fieldsByName[ev.target.value];
        const ops = field ? (OPERATORS[field.ttype] || OPERATORS.char) : OPERATORS.char;
        this.state.conditions[index].field = ev.target.value;
        this.state.conditions[index].operator = ops[0].id;
        this.state.conditions[index].value = "";
        this._emit();
    }

    onOperatorChange(index, ev) {
        this.state.conditions[index].operator = ev.target.value;
        this._emit();
    }

    onValueChange(index, ev) {
        this.state.conditions[index].value = ev.target.value;
        this._emit();
    }

    onBooleanChange(index, ev) {
        this.state.conditions[index].value = ev.target.checked;
        this._emit();
    }

    _emit() {
        this.props.onUpdate([...this.state.conditions]);
    }

    fieldLabel(fieldName) {
        return this.fieldsByName[fieldName]?.string || fieldName;
    }
}
