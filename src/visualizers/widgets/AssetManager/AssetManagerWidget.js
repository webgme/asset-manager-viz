/*globals define, WebGMEGlobal, $*/

/**
 * Generated by VisualizerGenerator 1.7.0 from webgme on Fri Feb 23 2018 11:40:01 GMT-0600 (Central Standard Time).
 */

define([
    'panels/AssetManager/CONSTANTS',
    'js/Controls/PropertyGrid/Widgets/AssetWidget',
    'js/Dialogs/MultiTab/MultiTabDialog',
    'js/Dialogs/Confirm/ConfirmDialog',
    'blob/BlobClient',
    'clipboard',
    'css!./styles/AssetManagerWidget.css'
], function (CONSTANTS, AssetWidget, MultiTabDialog, ConfirmDialog, BlobClient, Clipboard) {
    'use strict';

    const WIDGET_CLASS = 'asset-manager';

    function AssetManagerWidget(logger, container) {
        this.logger = logger.fork('Widget');
        this.el = container;
        this.blobClient = new BlobClient({logger: this.logger.fork('BlobClient')});
        this._initialize();

        this.attrs = {};
        this.cycle = 0;
        this.readOnly = false;

        this.logger.debug('ctor finished');
    }

    AssetManagerWidget.prototype._initialize = function () {
        // var width = this.el.width(),
        //     height = this.el.height(),
        //     self = this;

        // set widget class
        this.el.addClass(WIDGET_CLASS);

        const topBar = $('<span>', {class: 'top-bar'});

        topBar.append($('<span>', {class: 'top-bar-title', text: 'Assets'}));

        this.createNewBtn = $('<i>', {class: 'create-btn glyphicon glyphicon-plus-sign pull-right',
            title: 'Create new asset'});

        this.createNewBtn.on('click', () => {
            if (this.readOnly) {
                return;
            }

            const addRow = $('<tr>');
            const nameInput = $('<td>');
            addRow.append(nameInput);

            addRow.appendTo(this.table);

            nameInput.editInPlace({
                class: 'in-place-edit',
                value: '',
                onChange: (oldValue, newValue) => {
                    this.addNewAttribute(newValue);
                },
                onFinish: () => {
                    addRow.remove();
                }
            });
        });

        topBar.append(this.createNewBtn);

        this.el.append(topBar);

        topBar.append($('<div class="input-group">' +
            // '<span class="input-group-addon" id="basic-addon1"><i class="glyphicon glyphicon-filter"/></span>' +
            '<input type="text" class="form-control asset-filter" placeholder="Filter.." aria-describedby="basic-addon1">' +
            '</div>'));

        this.filterInput = topBar.find('input.asset-filter');

        this.filterInput.on('change paste keyup', (event) => {
            //console.log('Change in filter,', event.target.value);
            this.filter = (event.target.value || '').toUpperCase();
            this.applySortAndFilters();
        });

        this.filter = '';

        this.table = $('<table>', {class: 'table table-bordered table-striped'});

        const header = $('<tr>');

        const nameHeader = $('<th>', {text: 'Name', class: 'header-name'}).on('click', () => {
            if (this.reverseSort) {
                this.sortIcon.show();
                this.reverseSortIcon.hide();
            } else {
                this.sortIcon.hide();
                this.reverseSortIcon.show();
            }

            this.reverseSort = !this.reverseSort;
            this.applySortAndFilters();
        });

        this.reverseSort = false;
        this.sortIcon = $('<i>', {class: 'glyphicon glyphicon-sort-by-attributes sort-icon'});
        this.reverseSortIcon = $('<i>', {class: 'glyphicon glyphicon-sort-by-attributes-alt sort-icon'});

        this.sortIcon.hide();
        this.reverseSortIcon.hide();

        nameHeader.append(this.sortIcon).append(this.reverseSortIcon);

        header.append(nameHeader);
        header.append($('<th>', {text: 'Description', class: 'header-desc'}));
        header.append($('<th>', {text: 'Asset', class: 'header-asset'}));
        header.append($('<th>', {text: 'Actions', class: 'header-edit'}));

        this.tableBody = $('<tbody>');

        this.table.append(header);
        this.table.append(this.tableBody);

        this.tableBody.on('click', '.delete-btn', (event) => {
            const attrName = $(event.target).closest('tr').data('id');
            if (this.readOnly) {
                return;
            }

            (new ConfirmDialog()).show({deleteItem: attrName}, () => {
                this.deleteAttribute(attrName);
            });

        });

        this.tableBody.on('click', '.copy-download-url-btn, .copy-view-url-btn', (event) => {
            this.notifyUser({severity: 'success', message: 'Url copied to clipboard "' +
                $(event.target).attr('data-clipboard-text') + '".'});
        });

        this.tableBody.on('dblclick', '.row-name', (event) => {
            const trEl = $(event.target);
            const attrName = trEl.closest('tr').data('id');
            if (this.readOnly) {
                return;
            }

            trEl.editInPlace({
                class: 'in-place-edit',
                value: attrName,
                onChange: (oldValue, newValue) => {
                    this.renameAttribute(oldValue, newValue);
                },
                onFinish: () => {
                    // Wait for the new value to be accepted..
                    trEl.text(attrName);
                }
            });
        });

        this.tableBody.on('dblclick', '.row-desc', (event) => {
            const trEl = $(event.target);
            const attrName = trEl.closest('tr').data('id');
            const desc = trEl.text();
            if (this.readOnly) {
                return;
            }

            trEl.editInPlace({
                class: 'in-place-edit',
                value: desc,
                enableEmpty: true,
                onChange: (oldValue, newValue) => {
                    this.updateAttributeDescription(attrName, newValue);
                },
                onFinish: () => {
                    // Wait for the new value to be accepted..
                    trEl.text(desc);
                }
            });
        });

        this.el.append(this.table);
    };

    AssetManagerWidget.prototype.onWidgetContainerResize = function (width, height) {
        this.logger.debug('Widget is resizing...');
    };

    // Adding/Removing/Updating items
    AssetManagerWidget.prototype.atNewAttributes = function (newAttrs) {
        this.cycle += 1;

        newAttrs.forEach((attr) => {
            if (this.attrs.hasOwnProperty(attr.name)) {
                this.updateAttribute(attr);
            } else {
                this.addAttribute(attr);
            }
        });

        Object.keys(this.attrs).forEach((attrName) => {
            if (this.attrs[attrName].cycle !== this.cycle) {
                this.removeAttribute(attrName);
            }
        });

        this.applySortAndFilters();
    };

    AssetManagerWidget.prototype.addAttribute = function (attr) {
        const attrEl = $('<tr>');
        attrEl.data('id', attr.name);

        attrEl.append($('<td>', {
            text: attr.name,
            class: 'row-name'
        }));

        attrEl.append($('<td>', {
            text: attr.desc.description,
            class: 'row-desc'
        }));

        const assetRow = $('<td>', {
            class: 'row-asset'
        });

        const assetWidget = new AssetWidget({
            name: 'asset-manager-widget',
            id: attr.name,
            value: attr.value,
        });

        assetWidget.onFinishChange((data) => {
            if (data.newValue !== data.oldValue) {
                this.setAttributeAsset(attr.name, data.newValue);
            }
        });

        assetRow.append(assetWidget.el);
        attrEl.append(assetRow);

        attrEl.append($('<td>', {class: 'row-edit'})
            .append($('<i>', {
                class: 'action-btn copy-view-url-btn glyphicon glyphicon-eye-open',
                tile: 'Copy view url to clipboard'
            }))
            .append($('<i>', {
                class: 'action-btn copy-download-url-btn glyphicon glyphicon-copy',
                tile: 'Copy download url to clipboard'
            }))
            .append($('<i>', {
                class: 'action-btn delete-btn glyphicon glyphicon-trash',
                title: 'Delete asset...'
            }))
        );

        const copyViewBtn = attrEl.find('.copy-view-url-btn');
        const copyDownloadBtn = attrEl.find('.copy-download-url-btn');

        if (attr.value) {
            copyViewBtn.attr('data-clipboard-text', this.blobClient.getRelativeViewURL(attr.value));
            copyDownloadBtn.attr('data-clipboard-text', this.blobClient.getRelativeDownloadURL(attr.value));
        } else {
            copyViewBtn.hide();
            copyDownloadBtn.hide();
        }

        this.tableBody.append(attrEl);

        this.attrs[attr.name] = {
            el: attrEl,
            value: attr.value,
            description: attr.desc.description,
            cycle: this.cycle,
            assetWidget: assetWidget,
            clipboards: [(new Clipboard(copyViewBtn[0])), (new Clipboard(copyDownloadBtn[0]))]
        };
    };

    AssetManagerWidget.prototype.updateAttribute = function (attr) {
        const attrEl = this.attrs[attr.name].el;

        if (this.attrs[attr.name].value !== attr.value) {
            this.attrs[attr.name].assetWidget.setValue(attr.value);
            this.attrs[attr.name].value = attr.value;

            const copyViewBtn = attrEl.find('.copy-view-url-btn');
            const copyDownloadBtn = attrEl.find('.copy-download-url-btn');

            if (attr.value) {
                copyViewBtn.attr('data-clipboard-text', this.blobClient.getRelativeViewURL(attr.value));
                copyDownloadBtn.attr('data-clipboard-text', this.blobClient.getRelativeDownloadURL(attr.value));
                copyViewBtn.show();
                copyDownloadBtn.show();
            } else {
                copyViewBtn.hide();
                copyDownloadBtn.hide();
            }
        }

        if (this.attrs[attr.name].description !== attr.desc.description) {
            attrEl.find('.row-desc').text(attr.desc.description);

            this.attrs[attr.name].description = attr.desc.description;
        }

        this.attrs[attr.name].cycle = this.cycle;
    };

    AssetManagerWidget.prototype.removeAttribute = function (attrName) {
        this.attrs[attrName].assetWidget.destroy();
        this.attrs[attr.name].clipboards.forEach(cb => cb.destroy());
        this.attrs[attrName].el.remove();
        delete this.attrs[attrName];
    };

    AssetManagerWidget.prototype.applySortAndFilters = function () {
        const rows = this.tableBody.children('tr');

        rows.sort((a, b) => {
            const aName = $(a).children('td').eq(0).text().toUpperCase();
            const bName = $(b).children('td').eq(0).text().toUpperCase();

            if (aName > bName) {
                return this.reverseSort ? -1 : 1;
            } else if (aName < bName) {
                return this.reverseSort ? 1 : -1;
            }

            return 0;
        });

        rows.each((idx) => {
            const rowEl = $(rows[idx]);
            const rowName = rowEl.children('td').eq(0).text().toUpperCase();

            if (this.filter) {
                if (rowName.indexOf(this.filter) === -1) {
                    rowEl.hide();
                } else {
                    rowEl.show();
                }
            } else {
                rowEl.show();
            }
        });

        rows.detach().appendTo(this.tableBody);
    };

    /* * * * * * * * Visualizer life cycle callbacks * * * * * * * */
    AssetManagerWidget.prototype.setReadOnly = function (isReadOnly) {
        this.readOnly = isReadOnly;
        Object.keys(this.attrs).forEach((attrId) => {
            const attrItem = this.attrs[attrId];

            attrItem.assetWidget.setReadOnly(isReadOnly);
        });

        if (this.readOnly) {
            this.el.addClass('read-only');
        } else {
            this.el.removeClass('read-only');
        }
    };

    AssetManagerWidget.prototype.destroy = function () {
        Object.keys(this.attrs).forEach((attrId) => {
            const attrItem = this.attrs[attrId];

            attrItem.assetWidget.destroy();
            attrItem.clipboards.forEach(cb => cb.destroy());
        });
    };

    AssetManagerWidget.prototype.onActivate = function () {
        this.logger.debug('AssetManagerWidget has been activated');
    };

    AssetManagerWidget.prototype.onDeactivate = function () {
        this.logger.debug('AssetManagerWidget has been deactivated');
    };

    return AssetManagerWidget;
});
