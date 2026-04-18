/** @odoo-module **/
/**
 * ExportButtons Component
 * ========================
 * Renders PDF and XLSX export buttons.
 *
 * Props:
 *   onExportPdf   {Function}
 *   onExportXlsx  {Function}
 *   disabled      {Boolean}
 */

import { Component } from "@odoo/owl";

export class ExportButtons extends Component {
    static template = "financehub.ExportButtons";
    static props = {
        onExportPdf: { type: Function },
        onExportXlsx: { type: Function },
        disabled: { type: Boolean, optional: true },
    };

    onPdf() {
        if (!this.props.disabled) this.props.onExportPdf();
    }

    onXlsx() {
        if (!this.props.disabled) this.props.onExportXlsx();
    }
}
