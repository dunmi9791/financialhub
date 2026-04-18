/** @odoo-module **/
/**
 * MatchCandidatesPanel Component
 * ================================
 * Right-panel: shows the selected statement line details, match suggestions,
 * and action forms (match, write-off, split, create payment, mark review).
 *
 * Props:
 *   line           {Object|null}   Selected statement line
 *   auditLog       {Array}
 *   showAuditLog   {Boolean}
 *   onAction       {Function(payload)}  Emit reconciliation action
 *   onShowAudit    {Function}
 *   onHideAudit    {Function}
 */

import { Component, useState, onWillUpdateProps } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

const ACTION_MODES = {
    idle:           "idle",
    matching:       "matching",
    writeoff:       "writeoff",
    split:          "split",
    createPayment:  "createPayment",
};

export class MatchCandidatesPanel extends Component {
    static template = "financehub.MatchCandidatesPanel";
    static props = {
        line: { optional: true },
        auditLog: { type: Array, optional: true },
        showAuditLog: { type: Boolean, optional: true },
        onAction: { type: Function },
        onShowAudit: { type: Function },
        onHideAudit: { type: Function },
    };

    setup() {
        this.fh = useService("financehub");

        this.state = useState({
            suggestions: [],
            loadingSuggestions: false,
            mode: ACTION_MODES.idle,

            // Write-off form
            writeoff: {
                account_id: null,
                amount: 0,
                label: "Write-off",
                tax_ids: [],
            },
            accounts: [],

            // Split form
            splits: [],   // [{ amount, label }]

            // Create payment form
            payment: {
                partner_id: null,
                memo: "",
            },
            partners: [],

            // Manual search
            manualSearch: "",
            manualResults: [],
            loadingManual: false,
        });

        onWillUpdateProps(async (nextProps) => {
            if (nextProps.line?.id !== this.props.line?.id && nextProps.line) {
                await this._loadSuggestions(nextProps.line);
                this.state.mode = ACTION_MODES.idle;
                this._resetForms(nextProps.line);
            }
        });
    }

    async _loadSuggestions(line) {
        if (!line?.id) return;
        this.state.loadingSuggestions = true;
        try {
            const data = await this.fh.getMatchSuggestions(line.id);
            this.state.suggestions = data.suggestions || [];
        } catch (e) {
            this.fh.notifyError(e.message);
        } finally {
            this.state.loadingSuggestions = false;
        }
    }

    _resetForms(line) {
        if (!line) return;
        this.state.writeoff = {
            account_id: null,
            amount: Math.abs(line.amount || 0),
            label: `Write-off – ${line.payment_ref || ""}`,
            tax_ids: [],
        };
        this.state.splits = [
            { amount: line.amount || 0, label: line.payment_ref || "Part 1" },
            { amount: 0, label: "Part 2" },
        ];
        this.state.payment = {
            partner_id: line.partner_id || null,
            memo: line.payment_ref || "",
        };
    }

    // ── Mode switching ────────────────────────────────────────────────────

    startMatch() { this.state.mode = ACTION_MODES.matching; }
    startWriteoff() {
        this.state.mode = ACTION_MODES.writeoff;
        this._loadAccounts();
    }
    startSplit() { this.state.mode = ACTION_MODES.split; }
    startCreatePayment() {
        this.state.mode = ACTION_MODES.createPayment;
        this._loadPartners();
    }
    cancelAction() { this.state.mode = ACTION_MODES.idle; }

    async _loadAccounts() {
        if (this.state.accounts.length) return;
        try {
            this.state.accounts = await this.fh.getAccounts(null);
        } catch (e) { /* ignore */ }
    }

    async _loadPartners() {
        if (this.state.partners.length) return;
        try {
            this.state.partners = await this.fh.getPartners();
        } catch (e) { /* ignore */ }
    }

    // ── Match a suggestion ────────────────────────────────────────────────

    onSelectSuggestion(suggestion) {
        this.props.onAction({
            action: "match",
            line_id: this.props.line.id,
            match_type: suggestion.type,
            match_id: suggestion.id,
            note: `Matched to ${suggestion.label}`,
        });
    }

    // ── Write-off ─────────────────────────────────────────────────────────

    onWriteoffAccountChange(ev) {
        this.state.writeoff.account_id = parseInt(ev.target.value) || null;
    }

    onWriteoffAmountChange(ev) {
        this.state.writeoff.amount = parseFloat(ev.target.value) || 0;
    }

    onWriteoffLabelChange(ev) {
        this.state.writeoff.label = ev.target.value;
    }

    onConfirmWriteoff() {
        const { account_id, amount, label } = this.state.writeoff;
        if (!account_id) { this.fh.notifyError("Select a write-off account."); return; }
        this.props.onAction({
            action: "writeoff",
            line_id: this.props.line.id,
            account_id,
            amount,
            label,
        });
    }

    // ── Split ─────────────────────────────────────────────────────────────

    onSplitAmountChange(index, ev) {
        this.state.splits[index].amount = parseFloat(ev.target.value) || 0;
    }

    onSplitLabelChange(index, ev) {
        this.state.splits[index].label = ev.target.value;
    }

    addSplitPart() {
        this.state.splits.push({ amount: 0, label: `Part ${this.state.splits.length + 1}` });
    }

    removeSplitPart(index) {
        if (this.state.splits.length > 2) {
            this.state.splits.splice(index, 1);
        }
    }

    get splitTotal() {
        return this.state.splits.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    }

    get splitValid() {
        return Math.abs(this.splitTotal - Math.abs(this.props.line?.amount || 0)) < 0.01;
    }

    onConfirmSplit() {
        if (!this.splitValid) {
            this.fh.notifyError(`Split amounts must sum to ${Math.abs(this.props.line.amount)}`);
            return;
        }
        this.props.onAction({
            action: "split",
            line_id: this.props.line.id,
            parts: this.state.splits,
        });
    }

    // ── Create payment ────────────────────────────────────────────────────

    onPaymentPartnerChange(ev) {
        this.state.payment.partner_id = parseInt(ev.target.value) || null;
    }

    onPaymentMemoChange(ev) {
        this.state.payment.memo = ev.target.value;
    }

    onConfirmCreatePayment() {
        const { partner_id, memo } = this.state.payment;
        if (!partner_id) { this.fh.notifyError("Select a partner."); return; }
        this.props.onAction({
            action: "create_payment",
            line_id: this.props.line.id,
            partner_id,
            memo,
            amount: Math.abs(this.props.line.amount),
        });
    }

    // ── Mark for review ───────────────────────────────────────────────────

    onMarkReview() {
        this.props.onAction({
            action: "mark_review",
            line_id: this.props.line.id,
            note: "Marked for review",
        });
    }

    // ── Manual search ─────────────────────────────────────────────────────

    onManualSearchInput(ev) {
        this.state.manualSearch = ev.target.value;
    }

    async onManualSearch() {
        if (!this.state.manualSearch.trim()) return;
        this.state.loadingManual = true;
        try {
            // This would call a search endpoint; for now use suggestions as proxy
            const data = await this.fh.getMatchSuggestions(this.props.line.id);
            this.state.manualResults = (data.suggestions || []).filter(s =>
                (s.label || "").toLowerCase().includes(this.state.manualSearch.toLowerCase())
            );
        } catch (e) {
            this.fh.notifyError(e.message);
        } finally {
            this.state.loadingManual = false;
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────

    formatAmount(val) {
        const num = parseFloat(val);
        if (isNaN(num)) return "—";
        return num.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    scoreClass(score) {
        if (score >= 90) return "fh-score--high";
        if (score >= 60) return "fh-score--medium";
        return "fh-score--low";
    }

    get isMatchMode() { return this.state.mode === ACTION_MODES.matching; }
    get isWriteoffMode() { return this.state.mode === ACTION_MODES.writeoff; }
    get isSplitMode() { return this.state.mode === ACTION_MODES.split; }
    get isCreatePaymentMode() { return this.state.mode === ACTION_MODES.createPayment; }
    get isIdle() { return this.state.mode === ACTION_MODES.idle; }
}
