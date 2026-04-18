/** @odoo-module **/
/**
 * DrilldownDrawer Component
 * ==========================
 * Slide-in drawer that shows underlying account.move.lines for a
 * selected report row.  Supports pagination.
 *
 * Props:
 *   open         {Boolean}
 *   rowKey       {String}
 *   title        {String}
 *   filters      {Object}
 *   onClose      {Function}
 */

import { Component, useState, onWillUpdateProps } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

const PAGE_SIZE = 50;

export class DrilldownDrawer extends Component {
    static template = "financehub.DrilldownDrawer";
    static props = {
        open: { type: Boolean },
        rowKey: { type: String, optional: true },
        title: { type: String, optional: true },
        filters: { type: Object },
        onClose: { type: Function },
    };

    setup() {
        this.fh = useService("financehub");
        this.action = useService("action");

        this.state = useState({
            loading: false,
            error: null,
            rows: [],
            total: 0,
            page: 1,
            pages: 1,
        });

        onWillUpdateProps(async (nextProps) => {
            if (nextProps.open && nextProps.rowKey &&
                (nextProps.rowKey !== this.props.rowKey || !this.props.open)) {
                await this._load(nextProps.rowKey, nextProps.filters, 1);
            }
        });
    }

    async _load(rowKey, filters, page) {
        this.state.loading = true;
        this.state.error = null;
        try {
            const data = await this.fh.drilldown(rowKey, filters, page, PAGE_SIZE);
            this.state.rows = data.rows;
            this.state.total = data.total;
            this.state.page = data.page;
            this.state.pages = data.pages;
        } catch (e) {
            this.state.error = e.message;
        } finally {
            this.state.loading = false;
        }
    }

    async onPageChange(page) {
        if (page < 1 || page > this.state.pages) return;
        await this._load(this.props.rowKey, this.props.filters, page);
    }

    onClose() {
        this.props.onClose();
    }

    async onOpenMove(moveId) {
        // Navigate to the journal entry form
        this.action.doAction({
            type: "ir.actions.act_window",
            res_model: "account.move",
            res_id: moveId,
            views: [[false, "form"]],
            target: "current",
        });
    }

    formatAmount(val) {
        if (val === null || val === undefined) return "";
        const num = parseFloat(val);
        if (isNaN(num)) return String(val);
        return num.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }

    amountClass(val) {
        const num = parseFloat(val);
        return isNaN(num) ? "" : num < 0 ? "fh-cell--negative" : "";
    }

    get pageNumbers() {
        const pages = [];
        const { page, pages: total } = this.state;
        for (let i = Math.max(1, page - 2); i <= Math.min(total, page + 2); i++) {
            pages.push(i);
        }
        return pages;
    }
}
