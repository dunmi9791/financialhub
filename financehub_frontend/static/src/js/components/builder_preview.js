/** @odoo-module **/
/**
 * BuilderPreview Component
 * =========================
 * Step 5: live preview of the custom report.
 *
 * Props:
 *   spec       {Object}  currentSpec from report builder
 *   defId      {Number|null}  If saved, its definition id
 */

import { Component, useState, onWillUpdateProps } from "@odoo/owl";
import { useService } from "@web/core/utils/hooks";

export class BuilderPreview extends Component {
    static template = "financehub.BuilderPreview";
    static props = {
        spec: { type: Object },
        defId: { optional: true },
    };

    setup() {
        this.fh = useService("financehub");

        this.state = useState({
            loading: false,
            error: null,
            data: null,
        });
    }

    async runPreview() {
        if (!this.props.defId) {
            this.fh.notifyError("Save the report definition first to preview results.");
            return;
        }
        this.state.loading = true;
        this.state.error = null;
        try {
            this.state.data = await this.fh.runReport(
                `custom_${this.props.defId}`,
                {
                    date_from: `${new Date().getFullYear()}-01-01`,
                    date_to: new Date().toISOString().slice(0, 10),
                }
            );
        } catch (e) {
            this.state.error = e.message;
        } finally {
            this.state.loading = false;
        }
    }

    get columns() {
        return this.state.data?.columns || this.props.spec?.columns || [];
    }

    get rows() {
        return this.state.data?.rows || [];
    }

    formatCell(value, colType) {
        if (value === null || value === undefined) return "—";
        if (colType === "monetary") {
            const num = parseFloat(value);
            return isNaN(num) ? String(value) : num.toLocaleString("en-US", {
                minimumFractionDigits: 2, maximumFractionDigits: 2
            });
        }
        return String(value);
    }
}
