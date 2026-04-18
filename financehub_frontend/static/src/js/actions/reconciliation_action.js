/** @odoo-module **/
/**
 * FinanceHub Bank Reconciliation Action
 * ======================================
 * Registered as "financehub_reconciliation".
 * Orchestrates the ReconciliationWorkbench + related panels.
 */

import { Component, useState, onWillStart } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { ReconciliationWorkbench } from "../components/reconciliation_workbench";

export class FinancehubReconciliation extends Component {
    static template = "financehub.Reconciliation";
    static props = {};
    static components = { ReconciliationWorkbench };

    setup() {
        this.fh = useService("financehub");
    }
}

registry.category("actions").add("financehub_reconciliation", FinancehubReconciliation);
