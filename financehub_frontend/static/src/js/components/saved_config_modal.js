/** @odoo-module **/
/**
 * SavedConfigModal Component
 * ===========================
 * Dialog for saving / updating a report configuration.
 *
 * Props:
 *   open     {Boolean}
 *   initial  {Object}  Pre-fill values  (name, description, sharing, is_default)
 *   onSave   {Function(vals)}
 *   onCancel {Function}
 */

import { Component, useState } from "@odoo/owl";

export class SavedConfigModal extends Component {
    static template = "financehub.SavedConfigModal";
    static props = {
        open: { type: Boolean },
        initial: { type: Object, optional: true },
        onSave: { type: Function },
        onCancel: { type: Function },
    };

    setup() {
        const init = this.props.initial || {};
        this.state = useState({
            name: init.name || "",
            description: init.description || "",
            sharing: init.sharing || "private",
            is_default: init.is_default || false,
        });
    }

    get isValid() {
        return this.state.name.trim().length > 0;
    }

    onSave() {
        if (!this.isValid) return;
        this.props.onSave({
            name: this.state.name.trim(),
            description: this.state.description.trim(),
            sharing: this.state.sharing,
            is_default: this.state.is_default,
        });
    }

    onCancel() {
        this.props.onCancel();
    }

    onNameInput(ev) {
        this.state.name = ev.target.value;
    }

    onDescInput(ev) {
        this.state.description = ev.target.value;
    }

    onSharingChange(ev) {
        this.state.sharing = ev.target.value;
    }

    onDefaultToggle(ev) {
        this.state.is_default = ev.target.checked;
    }
}
