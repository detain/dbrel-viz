/**
 * Database Relationships Visualization - Shared Shell
 * Manages toolbar, data loading, sidebar, modals, and renderer switching.
 * Each visualization library registers as a renderer via DbRel.registerRenderer().
 * @author Joe Huss <detain@interserver.net>
 * @copyright 2025
 */
(function($) {
    'use strict';

    // Preserve any pre-set config (allows `window.DbRel = { paths: {...} }` before script loads)
    var preset = window.DbRel || {};
    var DbRel = window.DbRel = preset;

    /* ====================================================================
     * CONFIGURABLE PATHS
     * Override by setting window.DbRel = { paths: {...} } before this script loads.
     * ==================================================================== */

    DbRel.paths = Object.assign({
        renderers: '/js/',
        rendererPrefix: 'db_relationships_',
        rendererSuffix: '.js',
        libIcons: '/images/lib-icons/',
        tableIcons: '/images/myadmin/',
        ajaxUrl: 'ajax.php',
        ajaxChoice: 'db_relationships_data'
    }, DbRel.paths || {});

    /* ====================================================================
     * CONSTANTS
     * ==================================================================== */

    DbRel.DB_COLORS = {
        'my':        { header: '#007bff', bg: '#f0f7ff', border: '#b8daff' },
        'kayako_v4': { header: '#28a745', bg: '#f0fff4', border: '#b1dfbb' },
        'pdns':      { header: '#fd7e14', bg: '#fff8f0', border: '#ffd8b1' }
    };

    DbRel.TABLE_PALETTES = {
        'my': [
            '#2563eb', '#7c3aed', '#0891b2', '#0d9488', '#059669',
            '#ca8a04', '#d97706', '#dc2626', '#db2777', '#9333ea',
            '#4f46e5', '#0284c7', '#047857', '#b45309', '#be123c',
            '#6d28d9', '#1d4ed8', '#0e7490', '#15803d', '#a16207',
            '#c2410c', '#9f1239', '#7e22ce', '#1e40af', '#155e75',
            '#166534', '#854d0e', '#991b1b', '#9d174d', '#6b21a8'
        ],
        'kayako_v4': [
            '#15803d', '#047857', '#0d9488', '#059669', '#166534',
            '#14532d', '#115e59', '#134e4a', '#064e3b', '#065f46'
        ],
        'pdns': [
            '#c2410c', '#b45309', '#a16207', '#d97706', '#ea580c',
            '#9a3412', '#92400e', '#78350f'
        ]
    };

    DbRel.LINK_STYLES = {
        'direct':      { stroke: '#495057', strokeDasharray: '0',       strokeWidth: 1.2 },
        'find_in_set': { stroke: '#6f42c1', strokeDasharray: '8,4',     strokeWidth: 1.5 },
        'cross_db':    { stroke: '#fd7e14', strokeDasharray: '4,4,1,4', strokeWidth: 1.5 }
    };

    DbRel.PRIORITY_SUFFIXES = ['_id', '_custid', '_hostname', '_ip', '_name', '_status', '_type',
        '_invoice', '_server', '_lid', '_email', '_username'];
    DbRel.PRIORITY_EXACT = ['account_id', 'services_id', 'ticketid', 'subject', 'userid',
        'domain_id', 'name', 'title', 'email', 'fullname', 'id', 'custid'];

    DbRel.ROW_H = 13;
    DbRel.HDR_H = 22;
    DbRel.PAD = 4;
    DbRel.MAX_FIELDS = 6;
    DbRel.MAX_VAL_LEN = 24;

    // Per-table icons: myadmin image path
    // Format: { img: DbRel.paths.tableIcons + 'file.png' }
    DbRel.TABLE_ICONS = {
        'accounts':           { img: DbRel.paths.tableIcons + 'user.png' },
        'accounts_ext':       { img: DbRel.paths.tableIcons + 'contact-details.png' },
        'vps':                { img: DbRel.paths.tableIcons + 'cloud.png' },
        'vps_masters':        { img: DbRel.paths.tableIcons + 'linux-server.png' },
        'vps_ips':            { img: DbRel.paths.tableIcons + 'location.png' },
        'vps_ips6':           { img: DbRel.paths.tableIcons + 'location.png' },
        'websites':           { img: DbRel.paths.tableIcons + 'globe.png' },
        'website_masters':    { img: DbRel.paths.tableIcons + 'website.png' },
        'website_addons':     { img: DbRel.paths.tableIcons + 'add-property.png' },
        'domains':            { img: DbRel.paths.tableIcons + 'domain.png' },
        'backups':            { img: DbRel.paths.tableIcons + 'data-backup.png' },
        'backup_masters':     { img: DbRel.paths.tableIcons + 'cloud-storage.png' },
        'mail':               { img: DbRel.paths.tableIcons + 'e-mail.png' },
        'licenses':           { img: DbRel.paths.tableIcons + 'enter-key.png' },
        'ssl_certs':          { img: DbRel.paths.tableIcons + 'security-ssl.png' },
        'floating_ips':       { img: DbRel.paths.tableIcons + 'exchange.png' },
        'scrub_ips':          { img: DbRel.paths.tableIcons + 'shield.png' },
        'quickservers':       { img: DbRel.paths.tableIcons + 'speed.png' },
        'qs_ips':             { img: DbRel.paths.tableIcons + 'location.png' },
        'qs_ips6':            { img: DbRel.paths.tableIcons + 'location.png' },
        'servers':            { img: DbRel.paths.tableIcons + 'server.png' },
        'invoices_charges':   { img: DbRel.paths.tableIcons + 'invoice.png' },
        'invoices_payments':  { img: DbRel.paths.tableIcons + 'card-payment.png' },
        'invoices_refunds':   { img: DbRel.paths.tableIcons + 'refund.png' },
        'invoice_types':      { img: DbRel.paths.tableIcons + 'bulleted-list.png' },
        'repeat_invoices':    { img: DbRel.paths.tableIcons + 'recurring-appointment-exception.png' },
        'prepays':            { img: DbRel.paths.tableIcons + 'prepay.png' },
        'cc_log':             { img: DbRel.paths.tableIcons + 'credit-card.png' },
        'paypal':             { img: DbRel.paths.tableIcons + 'paypal.png' },
        'paypal_recurring_payments': { img: DbRel.paths.tableIcons + 'paypal.png' },
        'paypal_subscriptions': { img: DbRel.paths.tableIcons + 'paypal.png' },
        'coinbase':           { img: DbRel.paths.tableIcons + 'cash-in-hand.png' },
        'cashfree':           { img: DbRel.paths.tableIcons + 'cashflow.png' },
        'payssion':           { img: DbRel.paths.tableIcons + 'online-money-transfer.png' },
        'payu':               { img: DbRel.paths.tableIcons + 'buying.png' },
        'payza':              { img: DbRel.paths.tableIcons + 'wallet.png' },
        'payment_requests':   { img: DbRel.paths.tableIcons + 'request-money.png' },
        'pending_orders':     { img: DbRel.paths.tableIcons + 'hourglass.png' },
        'coupons':            { img: DbRel.paths.tableIcons + 'coupon.png' },
        'services':           { img: DbRel.paths.tableIcons + 'services.png' },
        'service_details':    { img: DbRel.paths.tableIcons + 'settings.png' },
        'service_types':      { img: DbRel.paths.tableIcons + 'tags.png' },
        'service_categories': { img: DbRel.paths.tableIcons + 'downloads-folder.png' },
        'assets':             { img: DbRel.paths.tableIcons + 'network-attached-storage.png' },
        'asset_types':        { img: DbRel.paths.tableIcons + 'data-grid.png' },
        'asset_racks':        { img: DbRel.paths.tableIcons + 'individual-server.png' },
        'asset_locations':    { img: DbRel.paths.tableIcons + 'user-location.png' },
        'switchports':        { img: DbRel.paths.tableIcons + 'network-card.png' },
        'switchmanager':      { img: DbRel.paths.tableIcons + 'switchboard.png' },
        'vlans':              { img: DbRel.paths.tableIcons + 'wired-network.png' },
        'vlans6':             { img: DbRel.paths.tableIcons + 'network.png' },
        'ips':                { img: DbRel.paths.tableIcons + 'network-drive.png' },
        'ipblocks':           { img: DbRel.paths.tableIcons + 'grid-3.png' },
        'ipmi_ips':           { img: DbRel.paths.tableIcons + 'cisco-router.png' },
        'ipmi_leases':        { img: DbRel.paths.tableIcons + 'router.png' },
        'emails':             { img: DbRel.paths.tableIcons + 'new-message.png' },
        'history_log':        { img: DbRel.paths.tableIcons + 'timeline.png' },
        'access_log':         { img: DbRel.paths.tableIcons + 'login.png' },
        'referrer_log':       { img: DbRel.paths.tableIcons + 'linking.png' },
        'trials':             { img: DbRel.paths.tableIcons + 'sand-clock.png' },
        'affiliates':         { img: DbRel.paths.tableIcons + 'agreement.png' },
        // Kayako tables
        'swusers':            { img: DbRel.paths.tableIcons + 'checked-user-male.png' },
        'swuseremails':       { img: DbRel.paths.tableIcons + 'find-user-male.png' },
        'swtickets':          { img: DbRel.paths.tableIcons + 'train-ticket.png' },
        'swticketstatus':     { img: DbRel.paths.tableIcons + 'info.png' },
        'swticketpriorities': { img: DbRel.paths.tableIcons + 'high-priority.png' },
        'swdepartments':      { img: DbRel.paths.tableIcons + 'hierarchy.png' },
        'swstaff':            { img: DbRel.paths.tableIcons + 'detective.png' },
        'swslaplans':         { img: DbRel.paths.tableIcons + 'speed.png' },
        'swemailqueues':      { img: DbRel.paths.tableIcons + 'read-message.png' },
        // PDNS tables
        'records':            { img: DbRel.paths.tableIcons + 'dns.png' }
    };

    /**
     * Get icon HTML for a table name (for sidebar and node headers).
     * Returns '<img src="..." class="db-rel-tbl-icon"> ' or ''
     */
    DbRel.getTableIconHtml = function(tableName) {
        var ic = DbRel.TABLE_ICONS[tableName];
        if (!ic || !ic.img) return '';
        return '<img src="' + ic.img + '" class="db-rel-tbl-icon"> ';
    };

    /**
     * Get icon info for a table (for renderers that draw SVG/canvas).
     * Returns { type: 'img', src: '/images/...' } or null
     */
    DbRel.getTableIconInfo = function(tableName) {
        var ic = DbRel.TABLE_ICONS[tableName];
        if (!ic || !ic.img) return null;
        return { type: 'img', src: ic.img };
    };

    /* ====================================================================
     * STATE
     * ==================================================================== */

    DbRel.data = null;
    DbRel.displayMode = 'separate';
    DbRel.showFullContent = false;
    DbRel.activeRendererKey = null;
    DbRel.renderers = {};
    DbRel._loadedScripts = {};

    // Pivot: which tables can be used as an alternate focal point
    // Maps table name → { idField: 'column', label: 'Display Name' }
    DbRel.PIVOT_TABLES = {
        'switchmanager':  { idField: 'id',         label: 'Switch' },
        'switchports':    { idField: 'switchport_id', label: 'Switchport' },
        'vps_masters':    { idField: 'vps_id',     label: 'VPS Host' },
        'website_masters':{ idField: 'website_id',  label: 'Web Host' },
        'backup_masters': { idField: 'backup_id',  label: 'Backup Host' },
        'servers':        { idField: 'server_id',  label: 'Server' },
        'assets':         { idField: 'id',          label: 'Asset' },
        'vlans':          { idField: 'vlans_id',   label: 'VLAN' }
    };

    // Current pivot state (null = default account-centric view)
    DbRel.pivot = null; // { table: 'switchmanager', id: 123, tableKey: 'my.switchmanager' }

    var tableColorCache = {};
    var tableColorIndex = { 'my': 0, 'kayako_v4': 0, 'pdns': 0 };

    /* ====================================================================
     * COLOR UTILITIES
     * ==================================================================== */

    DbRel.getTableColor = function(tableKey) {
        if (tableColorCache[tableKey]) return tableColorCache[tableKey];
        var parts = tableKey.split('.');
        var db = parts[0];
        var palette = DbRel.TABLE_PALETTES[db] || DbRel.TABLE_PALETTES['my'];
        var idx = tableColorIndex[db] || 0;
        var hdr = palette[idx % palette.length];
        tableColorIndex[db] = idx + 1;
        var r = parseInt(hdr.slice(1, 3), 16), g = parseInt(hdr.slice(3, 5), 16), b = parseInt(hdr.slice(5, 7), 16);
        var bg = 'rgb(' + Math.min(r + 200, 250) + ',' + Math.min(g + 200, 250) + ',' + Math.min(b + 200, 250) + ')';
        var border = 'rgb(' + Math.min(r + 140, 230) + ',' + Math.min(g + 140, 230) + ',' + Math.min(b + 140, 230) + ')';
        tableColorCache[tableKey] = { header: hdr, bg: bg, border: border };
        return tableColorCache[tableKey];
    };

    DbRel.resetTableColors = function() {
        tableColorCache = {};
        tableColorIndex = { 'my': 0, 'kayako_v4': 0, 'pdns': 0 };
    };

    /* ====================================================================
     * TEXT / DISPLAY HELPERS
     * ==================================================================== */

    DbRel.fmtVal = function(v) {
        if (v === null || v === undefined) return 'NULL';
        v = String(v);
        if (!DbRel.showFullContent && v.length > DbRel.MAX_VAL_LEN) return v.substring(0, DbRel.MAX_VAL_LEN - 2) + '..';
        if (DbRel.showFullContent && v.length > 100) return v.substring(0, 100) + '...';
        return v;
    };

    DbRel.pickDisplayColumns = function(columns, tableName) {
        var hiddenFields = (DbRel.data && DbRel.data.hiddenFields) || [];
        var priority = [], rest = [];
        columns.forEach(function(col) {
            if (hiddenFields.indexOf(col) > -1) return;
            var isPriority = DbRel.PRIORITY_EXACT.indexOf(col) > -1 ||
                DbRel.PRIORITY_SUFFIXES.some(function(s) { return col.indexOf(s) > -1; });
            if (isPriority) priority.push(col); else rest.push(col);
        });
        var result = priority.slice(0, DbRel.MAX_FIELDS);
        if (result.length < DbRel.MAX_FIELDS) result = result.concat(rest.slice(0, DbRel.MAX_FIELDS - result.length));
        return result;
    };

    DbRel.padRight = function(s, len) {
        while (s.length < len) s += ' ';
        return s.substring(0, len);
    };

    DbRel.repeatChar = function(ch, n) {
        var s = '';
        for (var i = 0; i < n; i++) s += ch;
        return s;
    };

    DbRel.getPrimaryKey = function(tableName) {
        return ((DbRel.data && DbRel.data.primaryKeys) || {})[tableName] || null;
    };

    DbRel.shortenColName = function(col, tableName) {
        var prefixes = (DbRel.data && DbRel.data.prefixes) || {};
        var prefix = prefixes[tableName];
        if (prefix && prefix.length > 0 && col.indexOf(prefix) === 0 && col.length > prefix.length) {
            return col.substring(prefix.length);
        }
        return col;
    };

    /* ====================================================================
     * NODE CONTENT HELPERS
     * ==================================================================== */

    DbRel.getNodeHeader = function(tableKey, rowIndex) {
        var tableName = tableKey.split('.')[1];
        var pkCol = DbRel.getPrimaryKey(tableName);
        var row = DbRel.data.tables[tableKey].rows[rowIndex];
        var pkVal = pkCol && row[pkCol] !== undefined ? row[pkCol] : (rowIndex + 1);
        return tableName + ' ' + pkVal;
    };

    DbRel.getNodeLines = function(tableKey, rowIndex) {
        var tableInfo = DbRel.data.tables[tableKey];
        var tableName = tableKey.split('.')[1];
        var hiddenFields = (DbRel.data && DbRel.data.hiddenFields) || [];
        var pkCol = DbRel.getPrimaryKey(tableName);
        var displayCols = DbRel.showFullContent
            ? tableInfo.columns.filter(function(c) { return hiddenFields.indexOf(c) === -1; })
            : DbRel.pickDisplayColumns(tableInfo.columns, tableName);
        var lines = [];
        displayCols.forEach(function(col) {
            if (col === pkCol) return;
            if (hiddenFields.indexOf(col) > -1) return;
            lines.push(DbRel.shortenColName(col, tableName) + ': ' + DbRel.fmtVal(tableInfo.rows[rowIndex][col]));
        });
        return lines;
    };

    DbRel.computeNodeSize = function(headerLabel, lines) {
        var maxLineLen = headerLabel.length + 2;
        lines.forEach(function(l) { if (l.length > maxLineLen) maxLineLen = l.length; });
        var maxW = DbRel.showFullContent ? 2000 : 300;
        return {
            w: Math.max(150, Math.min(maxW, maxLineLen * 6.5 + 12)),
            h: DbRel.HDR_H + DbRel.PAD + Math.max(lines.length, 1) * DbRel.ROW_H + DbRel.PAD
        };
    };

    DbRel.getGroupedLines = function(tableKey) {
        var MAX = DbRel.showFullContent ? 9999 : 12;
        var tableInfo = DbRel.data.tables[tableKey];
        var tableName = tableKey.split('.')[1];
        var hiddenFields = (DbRel.data && DbRel.data.hiddenFields) || [];
        var displayCols = DbRel.showFullContent
            ? tableInfo.columns.filter(function(c) { return hiddenFields.indexOf(c) === -1; })
            : DbRel.pickDisplayColumns(tableInfo.columns, tableName);
        var shortCols = displayCols.map(function(c) { return DbRel.shortenColName(c, tableName); });
        var colWidths = shortCols.map(function(sc) { return Math.max(sc.length, 3); });
        var displayRows = tableInfo.rows.slice(0, MAX);
        displayRows.forEach(function(row) {
            displayCols.forEach(function(col, ci) {
                var vl = DbRel.fmtVal(row[col]).length;
                if (vl > colWidths[ci]) colWidths[ci] = Math.min(vl, DbRel.MAX_VAL_LEN);
            });
        });
        var lines = [];
        lines.push(shortCols.map(function(sc, i) { return DbRel.padRight(sc, colWidths[i]); }).join(' | '));
        lines.push(colWidths.map(function(w) { return DbRel.repeatChar('\u2500', w); }).join('\u2500+\u2500'));
        displayRows.forEach(function(row) {
            lines.push(displayCols.map(function(col, ci) {
                return DbRel.padRight(DbRel.fmtVal(row[col]), colWidths[ci]);
            }).join(' | '));
        });
        if (tableInfo.rows.length > MAX) lines.push('... +' + (tableInfo.rows.length - MAX) + ' more');
        return lines;
    };

    DbRel.computeGroupedNodeSize = function(tableName, lines) {
        var maxLineLen = tableName.length + 10;
        lines.forEach(function(l) { if (l.length > maxLineLen) maxLineLen = l.length; });
        var maxW = DbRel.showFullContent ? 2000 : 500;
        return {
            w: Math.max(200, Math.min(maxW, maxLineLen * 6.5 + 16)),
            h: DbRel.HDR_H + DbRel.PAD + lines.length * DbRel.ROW_H + DbRel.PAD
        };
    };

    /* ====================================================================
     * SHARED LAYOUT ALGORITHM (BFS + column bin-packing)
     * ==================================================================== */

    DbRel.computeLayout = function(containerW, containerH) {
        if (!DbRel.data) return {};
        var CORRIDOR = 100, GAP_Y = 8, GROUP_GAP = 18, MARGIN = 20;
        var nodes = {}, tableGroups = {};
        var tableKeys = Object.keys(DbRel.data.tables);

        if (DbRel.displayMode === 'grouped') {
            tableKeys.forEach(function(tk) {
                var tn = tk.split('.')[1];
                var lines = DbRel.getGroupedLines(tk);
                var sz = DbRel.computeGroupedNodeSize(tn, lines);
                nodes[tk] = { w: sz.w, h: sz.h, tableKey: tk };
                tableGroups[tk] = [tk];
            });
        } else {
            tableKeys.forEach(function(tk) {
                tableGroups[tk] = [];
                DbRel.data.tables[tk].rows.forEach(function(row, ri) {
                    var nid = tk + ':' + ri;
                    var hdr = DbRel.getNodeHeader(tk, ri);
                    var lines = DbRel.getNodeLines(tk, ri);
                    var sz = DbRel.computeNodeSize(hdr, lines);
                    nodes[nid] = { w: sz.w, h: sz.h, tableKey: tk };
                    tableGroups[tk].push(nid);
                });
            });
        }

        var adj = {};
        tableKeys.forEach(function(tk) { adj[tk] = {}; });
        DbRel.data.relationships.forEach(function(rel) {
            if (adj[rel.source] !== undefined && adj[rel.target] !== undefined) {
                adj[rel.source][rel.target] = true;
                adj[rel.target][rel.source] = true;
            }
        });

        var layers = {}, visited = {}, queue = [];
        var root = tableKeys.find(function(tk) {
            return tk.indexOf('.accounts') > -1 && tk.indexOf('accounts_') === -1;
        }) || tableKeys[0];
        if (root) { queue.push(root); visited[root] = true; layers[root] = 0; }
        while (queue.length) {
            var cur = queue.shift();
            var nl = layers[cur] + 1;
            Object.keys(adj[cur] || {}).forEach(function(nb) {
                if (!visited[nb]) { visited[nb] = true; layers[nb] = nl; queue.push(nb); }
            });
        }
        var maxLayer = 0;
        Object.values(layers).forEach(function(l) { if (l > maxLayer) maxLayer = l; });
        tableKeys.forEach(function(tk) { if (layers[tk] === undefined) layers[tk] = maxLayer + 1; });

        var layerGroups = {};
        tableKeys.forEach(function(tk) {
            var l = layers[tk];
            if (!layerGroups[l]) layerGroups[l] = [];
            layerGroups[l].push(tk);
        });
        Object.keys(layerGroups).forEach(function(l) {
            layerGroups[l].sort(function(a, b) {
                return Object.keys(adj[b] || {}).length - Object.keys(adj[a] || {}).length;
            });
        });

        var targetRatio = Math.min((containerW || 1200) / (containerH || 700), 16 / 9) * 0.85;
        var layerNums = Object.keys(layerGroups).map(Number).sort(function(a, b) { return a - b; });

        function measureBlock(tk) {
            var nids = tableGroups[tk], maxW = 0, totalH = 0;
            nids.forEach(function(nid, i) {
                var n = nodes[nid];
                if (n.w > maxW) maxW = n.w;
                totalH += n.h + (i > 0 ? GAP_Y : 0);
            });
            return { tk: tk, nids: nids, w: maxW, h: totalH };
        }

        var allBlocks = [];
        layerNums.forEach(function(ln) {
            layerGroups[ln].forEach(function(tk) {
                var b = measureBlock(tk);
                b.layer = ln;
                allBlocks.push(b);
            });
        });
        var totalArea = 0;
        allBlocks.forEach(function(b) { totalArea += (b.w + CORRIDOR) * (b.h + GROUP_GAP); });
        var maxColH = Math.max(Math.sqrt(totalArea / targetRatio), (containerH || 700) * 0.6);

        var columns = [{ x: MARGIN, y: MARGIN, maxW: 0 }], globalMaxX = MARGIN;
        var positions = {};

        layerNums.forEach(function(ln) {
            var blocks = layerGroups[ln].map(function(tk) { return measureBlock(tk); });
            blocks.sort(function(a, b) { return b.h - a.h; });
            blocks.forEach(function(block) {
                var bestCol = -1, bestScore = Infinity;
                for (var ci = 0; ci < columns.length; ci++) {
                    var nb = columns[ci].y + block.h + GROUP_GAP;
                    if (nb <= maxColH || columns[ci].y <= MARGIN) {
                        var sc = maxColH - nb;
                        if (sc < bestScore) { bestScore = sc; bestCol = ci; }
                    }
                }
                if (bestCol === -1) {
                    columns.push({ x: globalMaxX + CORRIDOR, y: MARGIN, maxW: 0 });
                    bestCol = columns.length - 1;
                }
                var col = columns[bestCol];
                block.nids.forEach(function(nid) {
                    positions[nid] = { x: col.x, y: col.y, w: nodes[nid].w, h: nodes[nid].h };
                    col.y += nodes[nid].h + GAP_Y;
                    if (nodes[nid].w > col.maxW) col.maxW = nodes[nid].w;
                });
                col.y += GROUP_GAP - GAP_Y;
                if (col.x + col.maxW > globalMaxX) globalMaxX = col.x + col.maxW;
            });
        });

        return positions;
    };

    /* ====================================================================
     * PIVOT (re-center on a different table/row)
     * ==================================================================== */

    /**
     * Check if a table is pivotable (can be used as a focal point).
     * Returns the pivot config or null.
     */
    DbRel.getPivotConfig = function(tableName) {
        return DbRel.PIVOT_TABLES[tableName] || null;
    };

    /**
     * Check if a specific node (tableKey + rowIndex) is pivotable.
     * Returns { table, id, tableKey, idField, label } or null.
     */
    DbRel.getNodePivotInfo = function(tableKey, rowIndex) {
        if (!DbRel.data || !DbRel.data.tables[tableKey]) return null;
        var tableName = tableKey.split('.')[1];
        var cfg = DbRel.PIVOT_TABLES[tableName];
        if (!cfg) return null;
        var row = DbRel.data.tables[tableKey].rows[rowIndex];
        if (!row) return null;
        var id = row[cfg.idField];
        if (!id && id !== 0) return null;
        return {
            table: tableName,
            id: id,
            tableKey: tableKey,
            idField: cfg.idField,
            label: cfg.label + ' ' + id
        };
    };

    /**
     * Pivot to a new focal point. Loads data centered on the given table/row
     * instead of the account. Shows a breadcrumb trail.
     */
    DbRel.pivotTo = function(tableKey, rowIndex) {
        var info = DbRel.getNodePivotInfo(tableKey, rowIndex);
        if (!info) return;

        var custid = parseInt($('#db-rel-custid').val(), 10);
        if (!custid || custid <= 0) return;

        // Store pivot state
        DbRel.pivot = info;

        // Show pivot breadcrumb
        updatePivotBreadcrumb();

        // Load data with pivot params
        $('#db-rel-empty').hide();
        $('#db-rel-loading').show();
        $.ajax({
            url: DbRel.paths.ajaxUrl,
            data: {
                choice: DbRel.paths.ajaxChoice,
                custid: custid,
                pivot_table: info.table,
                pivot_id: info.id
            },
            dataType: 'json',
            timeout: 60000,
            success: function(resp) {
                $('#db-rel-loading').hide();
                if (resp.error) { alert('Error: ' + resp.error); return; }
                if (!resp.tables || !Object.keys(resp.tables).length) {
                    $('#db-rel-empty').show().find('p').text('No data found for ' + info.label);
                    return;
                }
                DbRel.data = resp;
                DbRel.resetTableColors();
                var r = DbRel.renderers[DbRel.activeRendererKey];
                if (r) {
                    r.render();
                    DbRel.updateSidebar();
                }
            },
            error: function(x, s, e) {
                $('#db-rel-loading').hide();
                alert('Failed: ' + (e || s));
            }
        });
    };

    /**
     * Reset pivot back to account-centric view.
     */
    DbRel.pivotReset = function() {
        DbRel.pivot = null;
        updatePivotBreadcrumb();
        var custid = parseInt($('#db-rel-custid').val(), 10);
        if (custid > 0) DbRel.loadData(custid);
    };

    /**
     * Direct pivot search from toolbar: load data for a pivot table ID
     * without needing a custid first. The backend will look up the custid.
     */
    DbRel.loadPivotDirect = function(table, id, fallbackCustid) {
        if (!id || id <= 0) return;
        var cfg = DbRel.PIVOT_TABLES[table];
        DbRel.pivot = {
            table: table,
            id: id,
            tableKey: 'my.' + table,
            idField: cfg ? cfg.idField : 'id',
            label: (cfg ? cfg.label : table) + ' ' + id
        };
        updatePivotBreadcrumb();

        $('#db-rel-empty').hide();
        $('#db-rel-loading').show();
        var params = {
            choice: DbRel.paths.ajaxChoice,
            pivot_table: table,
            pivot_id: id
        };
        // If we have a custid, pass it. Otherwise the backend needs to look it up.
        if (fallbackCustid > 0) {
            params.custid = fallbackCustid;
        } else {
            // Pass pivot_id as custid=0 so the backend knows to discover it
            params.custid = 0;
            params.discover_custid = 1;
        }
        $.ajax({
            url: DbRel.paths.ajaxUrl,
            data: params,
            dataType: 'json',
            timeout: 60000,
            success: function(resp) {
                $('#db-rel-loading').hide();
                if (resp.error) { alert('Error: ' + resp.error); return; }
                if (!resp.tables || !Object.keys(resp.tables).length) {
                    $('#db-rel-empty').show().find('p').text('No data found for ' + DbRel.pivot.label);
                    return;
                }
                DbRel.data = resp;
                // Update custid field if backend discovered it
                if (resp.metadata && resp.metadata.custid) {
                    $('#db-rel-custid').val(resp.metadata.custid);
                }
                DbRel.resetTableColors();
                var r = DbRel.renderers[DbRel.activeRendererKey];
                if (r) { r.render(); DbRel.updateSidebar(); }
            },
            error: function(x, s, e) {
                $('#db-rel-loading').hide();
                alert('Failed: ' + (e || s));
            }
        });
    };

    function updatePivotBreadcrumb() {
        var $bc = $('#db-rel-pivot-breadcrumb');
        if (!$bc.length) {
            // Create breadcrumb container after the lib selector
            $bc = $('<div id="db-rel-pivot-breadcrumb" class="db-rel-pivot-bc"></div>');
            $('#db-rel-lib-selector').after($bc);
        }
        if (!DbRel.pivot) {
            $bc.empty().hide();
            return;
        }
        $bc.html(
            '<span class="db-rel-pivot-label"><i class="fa fa-crosshairs mr-1"></i>Pivot:</span>' +
            '<a href="#" class="db-rel-pivot-home" title="Back to account view"><i class="fa fa-user"></i> Account ' +
            ($('#db-rel-custid').val() || '') + '</a>' +
            '<i class="fa fa-angle-right mx-1"></i>' +
            '<span class="db-rel-pivot-current">' + DbRel.pivot.label + '</span>'
        ).show();
    }

    /* ====================================================================
     * DISTANCE-BASED FOCUS OPACITY
     * Computes BFS hop distance from a focused node to all other nodes.
     * Returns { nodeId: distance } map. distance=0 for the focused node,
     * 1 for directly connected, 2 for two hops, etc. Unreachable = Infinity.
     * ==================================================================== */

    DbRel.computeNodeDistances = function(focusNodeId) {
        if (!DbRel.data) return {};
        var distances = {};
        distances[focusNodeId] = 0;

        // Build adjacency: nodeId → Set of connected nodeIds
        var adj = {};
        DbRel.data.relationships.forEach(function(rel) {
            if (DbRel.displayMode === 'grouped') {
                if (!adj[rel.source]) adj[rel.source] = {};
                if (!adj[rel.target]) adj[rel.target] = {};
                adj[rel.source][rel.target] = true;
                adj[rel.target][rel.source] = true;
            } else {
                (rel.matches || []).forEach(function(match) {
                    var srcId = rel.source + ':' + match[0];
                    match[1].forEach(function(tgtIdx) {
                        var tgtId = rel.target + ':' + tgtIdx;
                        if (!adj[srcId]) adj[srcId] = {};
                        if (!adj[tgtId]) adj[tgtId] = {};
                        adj[srcId][tgtId] = true;
                        adj[tgtId][srcId] = true;
                    });
                });
            }
        });

        // BFS
        var queue = [focusNodeId];
        while (queue.length) {
            var cur = queue.shift();
            var curDist = distances[cur];
            var neighbors = adj[cur] || {};
            Object.keys(neighbors).forEach(function(nb) {
                if (distances[nb] === undefined) {
                    distances[nb] = curDist + 1;
                    queue.push(nb);
                }
            });
        }
        return distances;
    };

    /**
     * Convert hop distance to opacity value.
     * distance 0 (focused) = 1.0
     * distance 1 (direct) = 1.0
     * distance 2 = 0.6
     * distance 3 = 0.35
     * distance 4+ = 0.12
     * unreachable = 0.12
     */
    DbRel.distanceToOpacity = function(distance) {
        if (distance === undefined || distance === Infinity) return 0.12;
        if (distance <= 1) return 1.0;
        if (distance === 2) return 0.6;
        if (distance === 3) return 0.35;
        return 0.12;
    };

    /* ====================================================================
     * TOOLTIP HELPERS
     * ==================================================================== */

    DbRel.showTooltip = function(html, x, y) {
        $('#db-rel-tooltip').html(html).css({ left: x + 12, top: y + 12, display: 'block' });
    };

    DbRel.hideTooltip = function() {
        $('#db-rel-tooltip').hide();
    };

    DbRel.getLinkTooltipHtml = function(relData) {
        return '<strong>' + (relData.label || '') + '</strong><br>' +
            '<small>' + relData.source_field + ' &rarr; ' + relData.target_field + '</small><br>' +
            '<small>' + relData.type + ' | ' + relData.cardinality + '</small>';
    };

    /* ====================================================================
     * ROW DETAIL MODAL
     * ==================================================================== */

    DbRel.showRowModal = function(tableKey, rowIndex) {
        if (!DbRel.data || !DbRel.data.tables[tableKey]) return;
        var row = DbRel.data.tables[tableKey].rows[rowIndex];
        if (!row) return;
        var hiddenFields = (DbRel.data && DbRel.data.hiddenFields) || [];
        var tableName = tableKey.split('.')[1];
        var pkCol = DbRel.getPrimaryKey(tableName);
        var tbody = '';
        Object.keys(row).forEach(function(col) {
            if (hiddenFields.indexOf(col) > -1) return;
            var val = row[col];
            if (val === null) val = '<em class="text-muted">NULL</em>';
            else {
                val = String(val);
                if (val.length > 500) val = val.substring(0, 500) + '...';
                val = $('<span>').text(val).html();
                val = val.replace(/&lt;br\s*\/?&gt;/gi, '<br>').replace(/\\n/g, '<br>');
            }
            tbody += '<tr><td><code>' + col + '</code></td><td style="word-break:break-word;max-width:600px;">' + val + '</td></tr>';
        });
        var pkVal = pkCol && row[pkCol] !== undefined ? row[pkCol] : (rowIndex + 1);
        $('#db-rel-row-modal-title').text(tableName + ' ' + pkVal);
        $('#db-rel-row-modal-table tbody').html(tbody);
        $('#db-rel-row-nav').hide();
        $('#db-rel-row-modal').modal('show');
    };

    /* ====================================================================
     * SIDEBAR
     * ==================================================================== */

    DbRel.updateSidebar = function() {
        if (!DbRel.data) return;
        var tableKeys = Object.keys(DbRel.data.tables).sort();
        var html = '';
        tableKeys.forEach(function(key) {
            var parts = key.split('.');
            var c = DbRel.getTableColor(key);
            html += '<div class="db-rel-table-item" data-table="' + key + '">' +
                '<span class="db-rel-table-dot" style="background:' + c.header + '"></span>' +
                '<span class="db-rel-tbl-icon-wrap" style="color:' + c.header + ';">' + DbRel.getTableIconHtml(parts[1]) + '</span>' +
                '<span class="db-rel-table-name" style="color:' + c.header + '; font-weight:600;">' + parts[1] + '</span>' +
                '<span class="badge badge-sm badge-light">' + DbRel.data.tables[key].total + '</span></div>';
        });
        $('#db-rel-table-list').html(html);
        $('#db-rel-table-count').text(tableKeys.length);
        var m = DbRel.data.metadata;
        var stats = (DbRel.activeRendererKey && DbRel.renderers[DbRel.activeRendererKey])
            ? DbRel.renderers[DbRel.activeRendererKey].getStats() : { nodes: 0, links: 0 };
        $('#db-rel-metadata').html('<small class="text-muted">Tables: ' + m.table_count +
            '<br>Rows: ' + m.total_rows +
            '<br>Nodes: ' + stats.nodes +
            '<br>Links: ' + stats.links +
            '<br>Lib: ' + (DbRel.RENDERERS[DbRel.activeRendererKey] || {}).name +
            '<br>Time: ' + m.query_time_ms + 'ms</small>');
    };

    /* ====================================================================
     * FILTER HELPERS
     * ==================================================================== */

    DbRel.getDbFilters = function() {
        var f = {};
        $('[data-filter-db]').each(function() { f[$(this).data('filter-db')] = $(this).hasClass('active'); });
        return f;
    };

    DbRel.getTypeFilters = function() {
        var f = {};
        $('[data-filter-type]').each(function() { f[$(this).data('filter-type')] = $(this).hasClass('active'); });
        return f;
    };

    /* ====================================================================
     * ZOOM SLIDER SYNC
     * ==================================================================== */

    DbRel.setZoomSlider = function(pct) {
        $('#db-rel-zoom').val(pct);
    };

    /* ====================================================================
     * DYNAMIC SCRIPT / CSS LOADING
     * ==================================================================== */

    DbRel.loadScript = function(url) {
        if (DbRel._loadedScripts[url]) return DbRel._loadedScripts[url];
        var p = new Promise(function(resolve, reject) {
            var s = document.createElement('script');
            s.src = url;
            s.onload = resolve;
            s.onerror = function() { reject(new Error('Failed: ' + url)); };
            document.head.appendChild(s);
        });
        DbRel._loadedScripts[url] = p;
        return p;
    };

    DbRel.loadCSS = function(url) {
        if (DbRel._loadedScripts[url]) return DbRel._loadedScripts[url];
        var p = new Promise(function(resolve) {
            var l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = url;
            l.onload = resolve;
            document.head.appendChild(l);
        });
        DbRel._loadedScripts[url] = p;
        return p;
    };

    /* ====================================================================
     * RENDERER MANIFEST
     * ==================================================================== */

    DbRel.RENDERERS = {
        'jointjs':    { name: 'JointJS',      icon: DbRel.paths.libIcons + 'jointjs.png',       github: 'https://github.com/clientIO/joint',               cat: 'graph',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'jointjs' + DbRel.paths.rendererSuffix,
            css: ['https://cdnjs.cloudflare.com/ajax/libs/jointjs/3.7.7/joint.min.css'],
            js: ['https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js',
                 'https://cdnjs.cloudflare.com/ajax/libs/backbone.js/1.4.1/backbone-min.js',
                 'https://cdnjs.cloudflare.com/ajax/libs/jointjs/3.7.7/joint.min.js',
                 'https://cdnjs.cloudflare.com/ajax/libs/graphlib/2.1.8/graphlib.min.js',
                 'https://cdnjs.cloudflare.com/ajax/libs/dagre/0.8.5/dagre.min.js'] },
        'cytoscape':  { name: 'Cytoscape',    icon: DbRel.paths.libIcons + 'cytoscape.svg',     github: 'https://github.com/cytoscape/cytoscape.js',       cat: 'graph',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'cytoscape' + DbRel.paths.rendererSuffix,
            js: ['https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.30.4/cytoscape.min.js'] },
        'sigma':      { name: 'Sigma.js',     icon: DbRel.paths.libIcons + 'sigma.svg',         github: 'https://github.com/jacomyal/sigma.js',            cat: 'graph',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'sigma' + DbRel.paths.rendererSuffix,
            js: ['https://unpkg.com/graphology@0.25.4/dist/graphology.umd.min.js',
                 'https://unpkg.com/sigma@2.4.0/build/sigma.min.js'] },
        'visjs':      { name: 'vis.js',       icon: DbRel.paths.libIcons + 'visjs.png',         github: 'https://github.com/visjs',                        cat: 'graph',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'visjs' + DbRel.paths.rendererSuffix,
            css: ['https://unpkg.com/vis-network@9.1.9/styles/vis-network.min.css'],
            js: ['https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js'] },
        'd3':         { name: 'D3.js',        icon: DbRel.paths.libIcons + 'd3.svg',            github: 'https://github.com/d3/d3',                        cat: 'graph',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'd3' + DbRel.paths.rendererSuffix,
            js: ['https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js'] },
        'gojs':       { name: 'GoJS',         icon: DbRel.paths.libIcons + 'gojs.svg',          github: 'https://github.com/NorthwoodsSoftware/gojs',      cat: 'graph',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'gojs' + DbRel.paths.rendererSuffix,
            js: ['https://cdnjs.cloudflare.com/ajax/libs/gojs/3.0.17/go.js'] },
        'forcegraph': { name: 'force-graph',  icon: DbRel.paths.libIcons + 'forcegraph.svg',    github: 'https://github.com/vasturiano/force-graph',       cat: 'graph',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'forcegraph' + DbRel.paths.rendererSuffix,
            js: ['https://unpkg.com/force-graph'] },
        'vivagraph':  { name: 'VivaGraph',    icon: DbRel.paths.libIcons + 'vivagraph.svg',     github: 'https://github.com/anvaka/VivaGraphJS',           cat: 'graph',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'vivagraph' + DbRel.paths.rendererSuffix,
            js: ['https://cdn.jsdelivr.net/npm/vivagraphjs@0.12.0/dist/vivagraph.min.js'] },
        'springy':    { name: 'Springy',      icon: DbRel.paths.libIcons + 'springy.svg',       github: 'https://github.com/dhotson/springy',              cat: 'graph',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'springy' + DbRel.paths.rendererSuffix,
            js: ['https://cdnjs.cloudflare.com/ajax/libs/springy/2.8.0/springy.min.js'] },
        'g6':         { name: 'AntV G6',      icon: DbRel.paths.libIcons + 'g6.svg',            github: 'https://github.com/antvis/G6',                    cat: 'graph',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'g6' + DbRel.paths.rendererSuffix,
            js: ['https://unpkg.com/@antv/g6@4.8.24/dist/g6.min.js'] },
        'c3':         { name: 'C3.js',        icon: DbRel.paths.libIcons + 'c3.svg',            github: 'https://github.com/c3js/c3',                     cat: 'chart',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'c3' + DbRel.paths.rendererSuffix,
            css: ['https://cdnjs.cloudflare.com/ajax/libs/c3/0.7.20/c3.min.css'],
            js: ['https://cdnjs.cloudflare.com/ajax/libs/d3/5.16.0/d3.min.js',
                 'https://cdnjs.cloudflare.com/ajax/libs/c3/0.7.20/c3.min.js'] },
        'dcjs':       { name: 'dc.js',        icon: DbRel.paths.libIcons + 'dcjs.png',          github: 'https://github.com/dc-js/dc.js',                 cat: 'chart',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'dcjs' + DbRel.paths.rendererSuffix,
            css: ['https://cdnjs.cloudflare.com/ajax/libs/dc/3.2.1/dc.min.css'],
            js: ['https://cdnjs.cloudflare.com/ajax/libs/d3/5.16.0/d3.min.js',
                 'https://cdn.jsdelivr.net/npm/crossfilter2@1.5.4/crossfilter.min.js',
                 'https://cdnjs.cloudflare.com/ajax/libs/dc/3.2.1/dc.min.js'] },
        'nvd3':       { name: 'NVD3',         icon: DbRel.paths.libIcons + 'nvd3.svg',          github: 'https://github.com/novus/nvd3',                   cat: 'chart',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'nvd3' + DbRel.paths.rendererSuffix,
            css: ['https://cdnjs.cloudflare.com/ajax/libs/nvd3/1.8.6/nv.d3.min.css'],
            js: ['https://cdnjs.cloudflare.com/ajax/libs/d3/3.5.17/d3.min.js',
                 'https://cdnjs.cloudflare.com/ajax/libs/nvd3/1.8.6/nv.d3.min.js'] },
        'p5':         { name: 'p5.js',        icon: DbRel.paths.libIcons + 'p5.svg',            github: 'https://github.com/processing/p5.js',             cat: 'other',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'p5' + DbRel.paths.rendererSuffix,
            js: ['https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js'] },
        'raphael':    { name: 'Raphael',      icon: DbRel.paths.libIcons + 'raphael.svg',       github: 'https://github.com/DmitryBaranovskiy/raphael',    cat: 'other',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'raphael' + DbRel.paths.rendererSuffix,
            js: ['https://cdnjs.cloudflare.com/ajax/libs/raphael/2.3.0/raphael.min.js'] },
        'vega':       { name: 'Vega',         icon: DbRel.paths.libIcons + 'vega.svg',          github: 'https://github.com/vega/vega',                    cat: 'other',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'vega' + DbRel.paths.rendererSuffix,
            js: ['https://cdn.jsdelivr.net/npm/vega@5/build/vega.min.js'] },
        'maxgraph':      { name: 'maxGraph',       icon: DbRel.paths.libIcons + 'maxgraph.svg',    github: 'https://github.com/maxGraph/maxGraph',          cat: 'other',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'maxgraph' + DbRel.paths.rendererSuffix, js: [] },
        'reactdiagrams': { name: 'React Diagrams', icon: DbRel.paths.libIcons + 'reactdiagrams.svg', github: 'https://github.com/projectstorm/react-diagrams', cat: 'react',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'reactdiagrams' + DbRel.paths.rendererSuffix, js: [] },
        'xyflow':        { name: 'XYFlow',         icon: DbRel.paths.libIcons + 'xyflow.svg',       github: 'https://github.com/xyflow/xyflow',             cat: 'react',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'xyflow' + DbRel.paths.rendererSuffix,
            js: ['https://unpkg.com/react@18/umd/react.production.min.js',
                 'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
                 'https://unpkg.com/reactflow@11/dist/umd/index.js'],
            css: ['https://unpkg.com/reactflow@11/dist/style.css'] },
        'recharts':      { name: 'Recharts',       icon: DbRel.paths.libIcons + 'recharts.svg',     github: 'https://github.com/recharts/recharts',          cat: 'chart',
            file: DbRel.paths.renderers + DbRel.paths.rendererPrefix + 'recharts' + DbRel.paths.rendererSuffix,
            js: ['https://unpkg.com/react@18/umd/react.production.min.js',
                 'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js',
                 'https://unpkg.com/prop-types@15/prop-types.min.js',
                 'https://unpkg.com/recharts@2/umd/Recharts.js'] }
    };

    /* ====================================================================
     * RENDERER REGISTRY & SWITCHING
     * ==================================================================== */

    DbRel.registerRenderer = function(key, renderer) {
        DbRel.renderers[key] = renderer;
    };

    function activateRenderer(key) {
        var r = DbRel.renderers[key];
        if (!r) { $('#db-rel-loading').hide(); return; }
        DbRel.activeRendererKey = key;
        r.init(document.getElementById('db-rel-paper'));
        // Update dropdown display
        var manifest = DbRel.RENDERERS[key];
        if (manifest) {
            $('#db-rel-lib-current-icon').attr('src', manifest.icon);
            $('#db-rel-lib-current-name').text(manifest.name);
        }
        $('.db-rel-lib-option').removeClass('active');
        $('.db-rel-lib-option[data-lib="' + key + '"]').addClass('active');
        if (DbRel.data) {
            DbRel.resetTableColors();
            r.render();
            DbRel.updateSidebar();
        }
        $('#db-rel-loading').hide();
    }

    DbRel.switchRenderer = function(key) {
        if (key === DbRel.activeRendererKey) return;
        var manifest = DbRel.RENDERERS[key];
        if (!manifest) return;

        $('#db-rel-loading').show();

        // Destroy current renderer
        if (DbRel.activeRendererKey && DbRel.renderers[DbRel.activeRendererKey]) {
            try { DbRel.renderers[DbRel.activeRendererKey].destroy(); } catch (e) {}
        }
        // Ensure container exists and is clean (some renderers set inline styles or remove it)
        var paperEl = document.getElementById('db-rel-paper');
        if (!paperEl) {
            paperEl = document.createElement('div');
            paperEl.id = 'db-rel-paper';
            document.getElementById('db-rel-paper-wrap').appendChild(paperEl);
        }
        // Full reset: clear all children, inline styles, AND CSS classes so each renderer starts fresh.
        // Previous renderers (like JointJS) add classes that have CSS rules affecting layout.
        paperEl.innerHTML = '';
        paperEl.removeAttribute('style');
        paperEl.className = '';

        // Handle D3 version conflicts: C3/dc.js need v5, NVD3 needs v3, D3 renderer needs v7.
        // If the new renderer needs a D3 version different from what's cached, clear the
        // old cache entry so the correct version loads fresh and overwrites window.d3.
        var newJsUrls = manifest.js || [];
        var needsD3 = newJsUrls.some(function(u) { return u.indexOf('/d3/') > -1 || u.indexOf('/d3.min.js') > -1; });
        if (needsD3) {
            var newD3Url = newJsUrls.find(function(u) { return u.indexOf('/d3/') > -1 || u.indexOf('/d3.min.js') > -1; });
            Object.keys(DbRel._loadedScripts).forEach(function(url) {
                if ((url.indexOf('/d3/') > -1 || url.indexOf('/d3.min.js') > -1) && url !== newD3Url) {
                    delete DbRel._loadedScripts[url];
                }
            });
            // Also clear the new URL's cache so it re-executes and overwrites window.d3
            delete DbRel._loadedScripts[newD3Url];
        }

        // Load CSS in parallel, JS sequentially (order matters for deps)
        var cssP = (manifest.css || []).map(function(u) { return DbRel.loadCSS(u); });
        var jsP = (manifest.js || []).reduce(function(chain, u) {
            return chain.then(function() { return DbRel.loadScript(u); });
        }, Promise.resolve());

        Promise.all([Promise.all(cssP), jsP]).then(function() {
            if (DbRel.renderers[key]) {
                activateRenderer(key);
            } else {
                DbRel.loadScript(manifest.file).then(function() {
                    activateRenderer(key);
                });
            }
        }).catch(function(err) {
            $('#db-rel-loading').hide();
            alert('Failed to load ' + manifest.name + ': ' + err.message);
        });
    };

    /* ====================================================================
     * DATA LOADING
     * ==================================================================== */

    DbRel.loadData = function(custid) {
        if (!custid || custid <= 0) return;
        // Reset pivot on new customer load
        DbRel.pivot = null;
        updatePivotBreadcrumb();
        $('#db-rel-empty').hide();
        $('#db-rel-loading').show();
        $.ajax({
            url: DbRel.paths.ajaxUrl,
            data: { choice: DbRel.paths.ajaxChoice, custid: custid },
            dataType: 'json',
            timeout: 60000,
            success: function(resp) {
                $('#db-rel-loading').hide();
                if (resp.error) { alert('Error: ' + resp.error); return; }
                if (!resp.tables || !Object.keys(resp.tables).length) {
                    $('#db-rel-empty').show().find('p').text('No data found for customer ID ' + custid);
                    return;
                }
                DbRel.data = resp;
                DbRel.resetTableColors();
                var r = DbRel.renderers[DbRel.activeRendererKey];
                if (r) {
                    r.render();
                    DbRel.updateSidebar();
                }
            },
            error: function(x, s, e) {
                $('#db-rel-loading').hide();
                alert('Failed: ' + (e || s));
            }
        });
    };

    /* ====================================================================
     * INIT
     * ==================================================================== */

    $(function() {
        // Pre-mark already-loaded scripts so we don't re-fetch them
        $('script[src]').each(function() { DbRel._loadedScripts[this.src] = Promise.resolve(); });
        $('link[rel="stylesheet"][href]').each(function() { DbRel._loadedScripts[this.href] = Promise.resolve(); });

        // Populate search type dropdown with pivot table options
        var $searchType = $('#db-rel-search-type');
        Object.keys(DbRel.PIVOT_TABLES).forEach(function(tbl) {
            var cfg = DbRel.PIVOT_TABLES[tbl];
            $searchType.append('<option value="' + tbl + '">' + cfg.label + ' (' + tbl + ')</option>');
        });

        // Build styled lib selector dropdown
        var catLabels = { graph: 'Graph / Network', chart: 'Chart + Graph', other: 'Alternative', react: 'React-based' };
        var catOrder = ['graph', 'chart', 'other', 'react'];
        var grouped = {};
        Object.keys(DbRel.RENDERERS).forEach(function(key) {
            var r = DbRel.RENDERERS[key];
            var c = r.cat || 'other';
            if (!grouped[c]) grouped[c] = [];
            grouped[c].push(key);
        });

        var defaultR = DbRel.RENDERERS['jointjs'];
        var dropHtml = '<div class="db-rel-lib-dropdown">' +
            '<button class="btn btn-sm btn-outline-secondary db-rel-lib-toggle" type="button" id="db-rel-lib-toggle">' +
            '<img src="' + defaultR.icon + '" class="db-rel-lib-logo" id="db-rel-lib-current-icon">' +
            '<span id="db-rel-lib-current-name">' + defaultR.name + '</span>' +
            '<i class="fa fa-caret-down ml-1"></i></button>' +
            '<div class="db-rel-lib-menu" id="db-rel-lib-menu">';

        catOrder.forEach(function(cat) {
            if (!grouped[cat]) return;
            dropHtml += '<div class="db-rel-lib-cat">' + catLabels[cat] + '</div>';
            grouped[cat].forEach(function(key) {
                var r = DbRel.RENDERERS[key];
                dropHtml += '<div class="db-rel-lib-option' + (key === 'jointjs' ? ' active' : '') + '" data-lib="' + key + '">' +
                    '<img src="' + r.icon + '" class="db-rel-lib-logo">' +
                    '<span class="db-rel-lib-opt-name">' + r.name + '</span>' +
                    '<a href="' + r.github + '" target="_blank" class="db-rel-lib-gh" title="GitHub" onclick="event.stopPropagation();">' +
                    '<i class="fa fa-github"></i></a></div>';
            });
        });
        dropHtml += '</div></div>';
        $('#db-rel-lib-selector').html(dropHtml);

        // Lib dropdown: preview on hover/arrow keys, confirm on click/enter, revert on close
        var libDropdownTimer = null;
        var libHoverTimer = null;      // 1-second delay before preview loads
        var libPreviewKey = null;      // key currently being previewed (not confirmed)
        var libConfirmedKey = null;    // the actually-selected key before dropdown opened
        var libKeys = Object.keys(DbRel.RENDERERS); // ordered list

        function openLibMenu() {
            clearTimeout(libDropdownTimer);
            libConfirmedKey = DbRel.activeRendererKey;
            libPreviewKey = null;
            $('#db-rel-lib-menu').addClass('open');
            // Scroll to active item
            var $active = $('.db-rel-lib-option.active');
            if ($active.length) {
                var menu = document.getElementById('db-rel-lib-menu');
                if (menu) menu.scrollTop = $active[0].offsetTop - menu.offsetTop - 60;
            }
        }

        function closeLibMenu(revert) {
            clearTimeout(libHoverTimer);
            $('#db-rel-lib-menu').removeClass('open');
            $('.db-rel-lib-option').removeClass('previewing');
            // Revert to confirmed renderer if we were previewing something else
            if (revert && libPreviewKey && libConfirmedKey && libPreviewKey !== libConfirmedKey) {
                DbRel.switchRenderer(libConfirmedKey);
            }
            libPreviewKey = null;
        }

        function previewLib(key) {
            if (!key || key === libPreviewKey) return;
            libPreviewKey = key;
            $('.db-rel-lib-option').removeClass('previewing');
            $('.db-rel-lib-option[data-lib="' + key + '"]').addClass('previewing');
            // Scroll into view
            var $el = $('.db-rel-lib-option[data-lib="' + key + '"]');
            if ($el.length) {
                var menu = document.getElementById('db-rel-lib-menu');
                var elTop = $el[0].offsetTop - menu.offsetTop;
                if (elTop < menu.scrollTop) menu.scrollTop = elTop - 10;
                if (elTop + 30 > menu.scrollTop + menu.clientHeight) menu.scrollTop = elTop - menu.clientHeight + 40;
            }
            // Load this renderer as a preview
            DbRel.switchRenderer(key);
        }

        function confirmLib(key) {
            libConfirmedKey = key;
            libPreviewKey = null;
            $('.db-rel-lib-option').removeClass('active previewing');
            $('.db-rel-lib-option[data-lib="' + key + '"]').addClass('active');
            closeLibMenu(false);
            // switchRenderer already called by previewLib or directly
            if (DbRel.activeRendererKey !== key) {
                DbRel.switchRenderer(key);
            }
        }

        // Open on hover
        $(document).on('mouseenter', '.db-rel-lib-dropdown', function() {
            clearTimeout(libDropdownTimer);
            if (!$('#db-rel-lib-menu').hasClass('open')) openLibMenu();
        });
        $(document).on('mouseleave', '.db-rel-lib-dropdown', function() {
            libDropdownTimer = setTimeout(function() { closeLibMenu(true); }, 300);
        });

        // Toggle on click (touch devices)
        $(document).on('click', '#db-rel-lib-toggle', function(e) {
            e.stopPropagation();
            if ($('#db-rel-lib-menu').hasClass('open')) {
                closeLibMenu(true);
            } else {
                openLibMenu();
            }
        });

        // Close on outside click (revert)
        $(document).on('click', function(e) {
            if (!$(e.target).closest('.db-rel-lib-dropdown').length) {
                closeLibMenu(true);
            }
        });

        // Hover over an option: preview after 1 second delay
        $(document).on('mouseenter', '.db-rel-lib-option', function() {
            var key = $(this).data('lib');
            clearTimeout(libHoverTimer);
            // Immediately show visual highlight
            $('.db-rel-lib-option').removeClass('previewing');
            $(this).addClass('previewing');
            // Delay the actual renderer switch by 1 second
            libHoverTimer = setTimeout(function() {
                previewLib(key);
            }, 1000);
        });
        $(document).on('mouseleave', '.db-rel-lib-option', function() {
            clearTimeout(libHoverTimer);
        });

        // Click an option: confirm it
        $(document).on('click', '.db-rel-lib-option', function(e) {
            e.stopPropagation();
            confirmLib($(this).data('lib'));
        });

        // Keyboard: up/down arrows to navigate, enter to confirm, escape to close
        $(document).on('keydown', function(e) {
            if (!$('#db-rel-lib-menu').hasClass('open')) return;
            var currentKey = libPreviewKey || DbRel.activeRendererKey;
            var idx = libKeys.indexOf(currentKey);

            if (e.key === 'ArrowDown' || e.keyCode === 40) {
                e.preventDefault();
                var nextIdx = (idx + 1) % libKeys.length;
                previewLib(libKeys[nextIdx]);
            } else if (e.key === 'ArrowUp' || e.keyCode === 38) {
                e.preventDefault();
                var prevIdx = (idx - 1 + libKeys.length) % libKeys.length;
                previewLib(libKeys[prevIdx]);
            } else if (e.key === 'Enter' || e.keyCode === 13) {
                e.preventDefault();
                if (libPreviewKey) confirmLib(libPreviewKey);
                else closeLibMenu(false);
            } else if (e.key === 'Escape' || e.keyCode === 27) {
                e.preventDefault();
                closeLibMenu(true);
            }
        });

        // Toolbar bindings
        $('#db-rel-load').on('click', function() {
            var searchType = $('#db-rel-search-type').val();
            var searchId = parseInt($('#db-rel-custid').val(), 10);
            if (!searchId || searchId <= 0) return;

            if (searchType === 'custid') {
                DbRel.loadData(searchId);
            } else {
                // Direct pivot search: load a specific table ID
                // We still need a custid - try to find it from the pivot table,
                // or use the current one if already loaded
                var currentCustid = DbRel.data && DbRel.data.metadata ? DbRel.data.metadata.custid : 0;
                DbRel.loadPivotDirect(searchType, searchId, currentCustid);
            }
        });
        $('#db-rel-custid').on('keypress', function(e) {
            if (e.which === 13) $('#db-rel-load').click();
        });
        // Update placeholder based on search type
        $('#db-rel-search-type').on('change', function() {
            var type = $(this).val();
            if (type === 'custid') {
                $('#db-rel-custid').attr('placeholder', 'Enter Customer ID');
            } else {
                var cfg = DbRel.PIVOT_TABLES[type];
                $('#db-rel-custid').attr('placeholder', 'Enter ' + (cfg ? cfg.label : type) + ' ID');
            }
        });

        $('[data-filter-db]').on('click', function() {
            $(this).toggleClass('active');
            var r = DbRel.renderers[DbRel.activeRendererKey];
            if (r) r.applyFilters(DbRel.getDbFilters(), DbRel.getTypeFilters());
        });
        $('[data-filter-type]').on('click', function() {
            $(this).toggleClass('active');
            var r = DbRel.renderers[DbRel.activeRendererKey];
            if (r) r.applyFilters(DbRel.getDbFilters(), DbRel.getTypeFilters());
        });

        function updateModeButtons() {
            $('#db-rel-mode-separate').toggleClass('active', DbRel.displayMode === 'separate');
            $('#db-rel-mode-grouped').toggleClass('active', DbRel.displayMode === 'grouped');
        }
        updateModeButtons();

        $('#db-rel-mode-separate').on('click', function() {
            if (DbRel.displayMode === 'separate') return;
            DbRel.displayMode = 'separate';
            updateModeButtons();
            if (DbRel.data && DbRel.activeRendererKey) {
                DbRel.resetTableColors();
                DbRel.renderers[DbRel.activeRendererKey].render();
                DbRel.updateSidebar();
            }
        });
        $('#db-rel-mode-grouped').on('click', function() {
            if (DbRel.displayMode === 'grouped') return;
            DbRel.displayMode = 'grouped';
            updateModeButtons();
            if (DbRel.data && DbRel.activeRendererKey) {
                DbRel.resetTableColors();
                DbRel.renderers[DbRel.activeRendererKey].render();
                DbRel.updateSidebar();
            }
        });

        $('#db-rel-expand').on('click', function() {
            DbRel.showFullContent = !DbRel.showFullContent;
            $(this).toggleClass('active', DbRel.showFullContent);
            if (DbRel.data && DbRel.activeRendererKey) {
                DbRel.resetTableColors();
                DbRel.renderers[DbRel.activeRendererKey].render();
                DbRel.updateSidebar();
            }
        });

        $('#db-rel-zoom').on('input', function() {
            var r = DbRel.renderers[DbRel.activeRendererKey];
            if (r) r.setZoom(parseInt($(this).val(), 10));
        });

        $('#db-rel-fit').on('click', function() {
            var r = DbRel.renderers[DbRel.activeRendererKey];
            if (r) r.fitToScreen();
        });

        $('#db-rel-relayout').on('click', function() {
            var r = DbRel.renderers[DbRel.activeRendererKey];
            if (r) r.doLayout();
        });

        // (Lib selector click/hover/keyboard handled above in dropdown block)

        // Sidebar table click
        $(document).on('click', '.db-rel-table-item', function() {
            var r = DbRel.renderers[DbRel.activeRendererKey];
            if (r) r.centerOnTable($(this).data('table'));
        });

        // Sidebar table hover → highlight matching nodes in the renderer
        $(document).on('mouseenter', '.db-rel-table-item', function() {
            var tk = $(this).data('table');
            var r = DbRel.renderers[DbRel.activeRendererKey];
            if (r && r.highlightTable) r.highlightTable(tk);
        });
        $(document).on('mouseleave', '.db-rel-table-item', function() {
            var r = DbRel.renderers[DbRel.activeRendererKey];
            if (r && r.clearHighlightTable) r.clearHighlightTable();
        });

        // Pivot button click (on nodes)
        $(document).on('click', '.db-rel-pivot-btn', function(e) {
            e.stopPropagation();
            var tk = $(this).data('table-key');
            var ri = parseInt($(this).data('row-index'), 10);
            if (tk && !isNaN(ri)) DbRel.pivotTo(tk, ri);
        });

        // Pivot breadcrumb - click home to reset
        $(document).on('click', '.db-rel-pivot-home', function(e) {
            e.preventDefault();
            DbRel.pivotReset();
        });

        // Help modal
        $('#db-rel-help').on('click', function() { $('#db-rel-help-modal').modal('show'); });
        // About modal (launched from Help modal footer)
        $('#db-rel-about-btn').on('click', function() {
            $('#db-rel-help-modal').modal('hide');
            setTimeout(function() { $('#db-rel-about-modal').modal('show'); }, 300);
        });
        $('#db-rel-help-modal').on('hidden.bs.modal', function() {
            if ($('#db-rel-help-dismiss').is(':checked')) {
                document.cookie = 'db_rel_help_seen=1; path=/; max-age=' + (365 * 86400) + '; SameSite=Lax';
            }
        });
        if (document.cookie.indexOf('db_rel_help_seen=1') === -1) {
            $('#db-rel-help-modal').modal('show');
        }

        // Window resize
        $(window).on('resize', function() {
            var r = DbRel.renderers[DbRel.activeRendererKey];
            if (r && r.resize) r.resize();
        });

        // Activate default renderer (JointJS should be registered by its script loaded before us)
        if (DbRel.renderers['jointjs']) {
            activateRenderer('jointjs');
        }

        // Auto-load data if custid provided
        var custid = parseInt($('#db-rel-custid').val(), 10);
        if (custid > 0) DbRel.loadData(custid);
    });

})(jQuery);
