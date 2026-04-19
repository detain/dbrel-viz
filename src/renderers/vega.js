/**
 * Database Relationships - Vega v5 Renderer
 * Declarative JSON spec built programmatically with signal-driven interactivity.
 * Registers with DbRel shared shell.
 */
(function() {
    'use strict';

    var vegaView = null, containerEl = null;
    var currentBuiltData = null;
    var focusedNodeId = null;
    var currentScale = 1;
    var panX = 0, panY = 0;
    var vegaDocMoveHandler = null, vegaDocUpHandler = null;

    var CHAR_W = 7;

    var VEGA_LINK_STYLES = {
        'direct':      { stroke: '#6c8ebf', dash: [],           width: 1.5 },
        'find_in_set': { stroke: '#a678de', dash: [8, 4],       width: 1.8 },
        'cross_db':    { stroke: '#fd7e14', dash: [4, 4, 1, 4], width: 1.8 }
    };

    /* ====================================================================
     * BUILD VEGA DATA - SEPARATE MODE
     * ==================================================================== */

    function buildSeparateData() {
        var nodeList = [];
        var linkData = [];
        var textItems = [];
        var tableKeys = Object.keys(DbRel.data.tables);

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);

            tableInfo.rows.forEach(function(row, ri) {
                var nodeId = tableKey + ':' + ri;
                var headerLabel = DbRel.getNodeHeader(tableKey, ri);
                var lines = DbRel.getNodeLines(tableKey, ri);
                var size = DbRel.computeNodeSize(headerLabel, lines);

                var _iconInfo = DbRel.getTableIconInfo(tableName);
                var iconImgUrl = _iconInfo && _iconInfo.src ? _iconInfo.src : '';
                nodeList.push({
                    id: nodeId,
                    tableKey: tableKey,
                    dbName: dbName,
                    tableName: tableName,
                    rowIndex: ri,
                    headerLabel: headerLabel,
                    headerColor: colors.header,
                    bgColor: colors.bg,
                    borderColor: colors.border,
                    w: size.w,
                    h: size.h,
                    x: 0, y: 0,
                    opacity: 1,
                    pivotable: !!DbRel.getPivotConfig(tableName),
                    iconImg: iconImgUrl,
                    hasIcon: !!iconImgUrl
                });

                lines.forEach(function(line, li) {
                    textItems.push({
                        nodeId: nodeId,
                        text: line,
                        lineIndex: li,
                        dy: DbRel.HDR_H + DbRel.PAD + (li + 1) * DbRel.ROW_H
                    });
                });
            });
        });

        var nodeMap = {};
        nodeList.forEach(function(n) { nodeMap[n.id] = n; });

        DbRel.data.relationships.forEach(function(rel) {
            var style = VEGA_LINK_STYLES[rel.type] || VEGA_LINK_STYLES['direct'];
            (rel.matches || []).forEach(function(match) {
                var srcId = rel.source + ':' + match[0];
                if (!nodeMap[srcId]) return;
                match[1].forEach(function(tgtRowIdx) {
                    var tgtId = rel.target + ':' + tgtRowIdx;
                    if (!nodeMap[tgtId]) return;
                    linkData.push({
                        source: srcId,
                        target: tgtId,
                        relType: rel.type,
                        label: rel.source_field + '\u2192' + rel.target_field,
                        fullLabel: rel.label,
                        strokeColor: style.stroke,
                        strokeWidth: style.width,
                        strokeDash: style.dash,
                        cardinality: rel.cardinality,
                        sourceField: rel.source_field,
                        targetField: rel.target_field,
                        opacity: 1
                    });
                });
            });
        });

        applyLayout(nodeList, linkData);

        nodeList.forEach(function(n) { nodeMap[n.id] = n; });
        textItems.forEach(function(t) {
            var n = nodeMap[t.nodeId];
            if (n) {
                t.x = n.x + 6;
                t.y = n.y + t.dy;
                t.opacity = n.opacity;
            }
        });

        return { nodes: nodeList, links: linkData, texts: textItems };
    }

    /* ====================================================================
     * BUILD VEGA DATA - GROUPED MODE
     * ==================================================================== */

    function buildGroupedData() {
        var nodeList = [];
        var linkData = [];
        var textItems = [];
        var tableKeys = Object.keys(DbRel.data.tables);

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);
            var lines = DbRel.getGroupedLines(tableKey);
            var size = DbRel.computeGroupedNodeSize(tableName, lines);

            var _iconInfo2 = DbRel.getTableIconInfo(tableName);
            var iconImgUrl2 = _iconInfo2 && _iconInfo2.src ? _iconInfo2.src : '';
            nodeList.push({
                id: tableKey,
                tableKey: tableKey,
                dbName: dbName,
                tableName: tableName,
                rowIndex: 0,
                headerLabel: tableName + ' (' + tableInfo.total + ')',
                headerColor: colors.header,
                bgColor: colors.bg,
                borderColor: colors.border,
                w: size.w,
                h: size.h,
                x: 0, y: 0,
                opacity: 1,
                pivotable: !!DbRel.getPivotConfig(tableName),
                iconImg: iconImgUrl2,
                hasIcon: !!iconImgUrl2
            });

            lines.forEach(function(line, li) {
                textItems.push({
                    nodeId: tableKey,
                    text: line,
                    lineIndex: li,
                    dy: DbRel.HDR_H + DbRel.PAD + (li + 1) * DbRel.ROW_H
                });
            });
        });

        var nodeMap = {};
        nodeList.forEach(function(n) { nodeMap[n.id] = n; });

        DbRel.data.relationships.forEach(function(rel) {
            if (!nodeMap[rel.source] || !nodeMap[rel.target]) return;
            var style = VEGA_LINK_STYLES[rel.type] || VEGA_LINK_STYLES['direct'];
            linkData.push({
                source: rel.source,
                target: rel.target,
                relType: rel.type,
                label: rel.label,
                fullLabel: rel.label,
                strokeColor: style.stroke,
                strokeWidth: style.width,
                strokeDash: style.dash,
                cardinality: rel.cardinality,
                sourceField: rel.source_field,
                targetField: rel.target_field,
                opacity: 1
            });
        });

        applyLayout(nodeList, linkData);

        nodeList.forEach(function(n) { nodeMap[n.id] = n; });
        textItems.forEach(function(t) {
            var n = nodeMap[t.nodeId];
            if (n) {
                t.x = n.x + 6;
                t.y = n.y + t.dy;
                t.opacity = n.opacity;
            }
        });

        return { nodes: nodeList, links: linkData, texts: textItems };
    }

    /* ====================================================================
     * LAYOUT (uses DbRel.computeLayout)
     * ==================================================================== */

    function applyLayout(nodeList, linkData) {
        var cW = containerEl ? containerEl.clientWidth : 1200;
        var cH = containerEl ? containerEl.clientHeight : 700;
        var positions = DbRel.computeLayout(cW, cH);

        nodeList.forEach(function(n) {
            var pos = positions[n.id];
            if (pos) {
                n.x = pos.x;
                n.y = pos.y;
            }
        });
    }

    /* ====================================================================
     * LINK GEOMETRY
     * ==================================================================== */

    function computeLinkPaths(nodeList, linkData) {
        var nodeMap = {};
        nodeList.forEach(function(n) { nodeMap[n.id] = n; });

        var pathData = [];
        linkData.forEach(function(lnk, li) {
            var sn = nodeMap[lnk.source];
            var tn = nodeMap[lnk.target];
            if (!sn || !tn) return;

            var exitX, enterX;
            if (sn.x + sn.w < tn.x) {
                exitX = sn.x + sn.w;
                enterX = tn.x;
            } else if (tn.x + tn.w < sn.x) {
                exitX = sn.x;
                enterX = tn.x + tn.w;
            } else {
                exitX = sn.x + sn.w;
                enterX = tn.x + tn.w;
            }

            var exitY = sn.y + sn.h / 2;
            var enterY = tn.y + tn.h / 2;

            var padX1 = exitX + (exitX <= sn.x ? -15 : 15);
            var padX2 = enterX + (enterX <= tn.x ? 15 : -15);
            var midX = (padX1 + padX2) / 2 + (li % 5) * 6;

            var pathStr;
            if (Math.abs(exitY - enterY) < 3 && Math.abs(exitX - enterX) > 20) {
                pathStr = 'M ' + exitX + ' ' + exitY + ' L ' + enterX + ' ' + enterY;
            } else {
                pathStr = 'M ' + exitX + ' ' + exitY +
                    ' L ' + padX1 + ' ' + exitY +
                    ' L ' + midX + ' ' + exitY +
                    ' L ' + midX + ' ' + enterY +
                    ' L ' + padX2 + ' ' + enterY +
                    ' L ' + enterX + ' ' + enterY;
            }

            var labelX = midX;
            var labelY = (exitY + enterY) / 2;

            pathData.push({
                path: pathStr,
                strokeColor: lnk.strokeColor,
                strokeWidth: lnk.strokeWidth,
                strokeDash: lnk.strokeDash,
                label: lnk.label,
                fullLabel: lnk.fullLabel,
                labelX: labelX,
                labelY: labelY,
                relType: lnk.relType,
                cardinality: lnk.cardinality,
                sourceField: lnk.sourceField,
                targetField: lnk.targetField,
                source: lnk.source,
                target: lnk.target,
                opacity: lnk.opacity
            });
        });

        return pathData;
    }

    /* ====================================================================
     * BUILD VEGA SPEC
     * ==================================================================== */

    function buildVegaSpec(builtData) {
        var nodeList = builtData.nodes;
        var linkData = builtData.links;
        var texts = builtData.texts;
        var paths = computeLinkPaths(nodeList, linkData);

        var maxX = 0, maxY = 0;
        nodeList.forEach(function(n) {
            if (n.x + n.w > maxX) maxX = n.x + n.w;
            if (n.y + n.h > maxY) maxY = n.y + n.h;
        });
        maxX += 60;
        maxY += 60;

        var HDR_H = DbRel.HDR_H;

        var spec = {
            "$schema": "https://vega.github.io/schema/vega/v5.json",
            "width": maxX,
            "height": maxY,
            "padding": 0,
            "autosize": "none",
            "background": "#ffffff",

            "signals": [
                {
                    "name": "hoveredNode",
                    "value": null,
                    "on": [
                        {"events": "@nodeBody:mouseover", "update": "datum.id"},
                        {"events": "@nodeBody:mouseout", "update": "null"},
                        {"events": "@nodeHeader:mouseover", "update": "datum.id"},
                        {"events": "@nodeHeader:mouseout", "update": "null"}
                    ]
                },
                {
                    "name": "clickedNode",
                    "value": null,
                    "on": [
                        {"events": "@nodeBody:click, @nodeHeader:click", "update": "clickedNode === datum.id ? null : datum.id"}
                    ]
                },
                {
                    "name": "dblClickNode",
                    "value": null,
                    "on": [
                        {"events": "@nodeBody:dblclick, @nodeHeader:dblclick", "update": "datum"}
                    ]
                },
                {
                    "name": "hoveredLink",
                    "value": null,
                    "on": [
                        {"events": "@linkPaths:mouseover", "update": "datum"},
                        {"events": "@linkPaths:mouseout", "update": "null"}
                    ]
                },
                {
                    "name": "linkHoverX",
                    "value": 0,
                    "on": [{"events": "@linkPaths:mouseover", "update": "x()"}]
                },
                {
                    "name": "linkHoverY",
                    "value": 0,
                    "on": [{"events": "@linkPaths:mouseover", "update": "y()"}]
                }
            ],

            "data": [
                { "name": "nodes", "values": nodeList },
                { "name": "links", "values": paths },
                { "name": "texts", "values": texts },
                { "name": "linkLabels", "values": paths.filter(function(p) { return p.label; }) },
                {
                    "name": "connectedToClicked",
                    "source": "links",
                    "transform": [
                        {"type": "filter", "expr": "clickedNode != null && (datum.source === clickedNode || datum.target === clickedNode)"},
                        {"type": "fold", "fields": ["source", "target"]},
                        {"type": "formula", "as": "connId", "expr": "datum.value"},
                        {"type": "aggregate", "groupby": ["connId"]}
                    ]
                },
                {
                    "name": "connectedToHovered",
                    "source": "links",
                    "transform": [
                        {"type": "filter", "expr": "hoveredNode != null && clickedNode == null && (datum.source === hoveredNode || datum.target === hoveredNode)"},
                        {"type": "fold", "fields": ["source", "target"]},
                        {"type": "formula", "as": "connId", "expr": "datum.value"},
                        {"type": "aggregate", "groupby": ["connId"]}
                    ]
                }
            ],

            "marks": [
                // Link paths
                {
                    "type": "path",
                    "name": "linkPaths",
                    "from": {"data": "links"},
                    "encode": {
                        "enter": {
                            "path": {"field": "path"},
                            "stroke": {"field": "strokeColor"},
                            "strokeWidth": {"field": "strokeWidth"},
                            "strokeDash": {"field": "strokeDash"},
                            "fill": {"value": null},
                            "cursor": {"value": "pointer"},
                            "tooltip": {"signal": "datum.fullLabel + ' (' + datum.cardinality + ')' "}
                        },
                        "update": {
                            "strokeOpacity": {
                                "signal": "clickedNode ? datum.opacity : (hoveredNode ? (datum.source === hoveredNode || datum.target === hoveredNode ? 1 : 0.25) : 0.7)"
                            },
                            "strokeWidth": {
                                "signal": "(hoveredLink === datum || (hoveredNode && (datum.source === hoveredNode || datum.target === hoveredNode))) ? datum.strokeWidth + 1.5 : datum.strokeWidth"
                            }
                        }
                    }
                },
                // Link labels
                {
                    "type": "text",
                    "from": {"data": "linkLabels"},
                    "encode": {
                        "enter": {
                            "x": {"field": "labelX"},
                            "y": {"field": "labelY"},
                            "text": {"field": "label"},
                            "fontSize": {"value": 8},
                            "fontFamily": {"value": "monospace"},
                            "fill": {"field": "strokeColor"},
                            "align": {"value": "center"},
                            "baseline": {"value": "middle"},
                            "opacity": {"value": 0.8}
                        },
                        "update": {
                            "opacity": {
                                "signal": "clickedNode ? datum.opacity : 0.8"
                            }
                        }
                    }
                },
                // Node bodies
                {
                    "type": "rect",
                    "name": "nodeBody",
                    "from": {"data": "nodes"},
                    "encode": {
                        "enter": {
                            "x": {"field": "x"},
                            "y": {"field": "y"},
                            "width": {"field": "w"},
                            "height": {"field": "h"},
                            "fill": {"field": "bgColor"},
                            "stroke": {"field": "borderColor"},
                            "strokeWidth": {"value": 1},
                            "cornerRadius": {"value": 4},
                            "cursor": {"value": "pointer"}
                        },
                        "update": {
                            "strokeWidth": {
                                "signal": "(hoveredNode === datum.id || clickedNode === datum.id) ? 2.5 : (clickedNode && indata('connectedToClicked', 'connId', datum.id)) ? 2 : (hoveredNode && clickedNode == null && indata('connectedToHovered', 'connId', datum.id)) ? 2 : 1"
                            },
                            "stroke": {
                                "signal": "(hoveredNode === datum.id || clickedNode === datum.id) ? '#e94560' : (clickedNode && indata('connectedToClicked', 'connId', datum.id)) ? '#e94560' : (hoveredNode && clickedNode == null && indata('connectedToHovered', 'connId', datum.id)) ? datum.headerColor : datum.borderColor"
                            },
                            "opacity": {
                                "signal": "clickedNode ? datum.opacity : (hoveredNode ? (datum.id === hoveredNode || indata('connectedToHovered', 'connId', datum.id) ? 1 : 0.4) : 1)"
                            }
                        }
                    }
                },
                // Node headers
                {
                    "type": "rect",
                    "name": "nodeHeader",
                    "from": {"data": "nodes"},
                    "encode": {
                        "enter": {
                            "x": {"field": "x"},
                            "y": {"field": "y"},
                            "width": {"field": "w"},
                            "height": {"value": HDR_H},
                            "fill": {"field": "headerColor"},
                            "cornerRadiusTopLeft": {"value": 4},
                            "cornerRadiusTopRight": {"value": 4},
                            "cornerRadiusBottomLeft": {"value": 0},
                            "cornerRadiusBottomRight": {"value": 0},
                            "cursor": {"value": "pointer"}
                        },
                        "update": {
                            "opacity": {
                                "signal": "clickedNode ? datum.opacity : (hoveredNode ? (datum.id === hoveredNode || indata('connectedToHovered', 'connId', datum.id) ? 1 : 0.4) : 1)"
                            }
                        }
                    }
                },
                // Table icon (image) in header - uses iconImg URL for all icon types
                {
                    "type": "image",
                    "from": {"data": "nodes"},
                    "encode": {
                        "enter": {
                            "x": {"signal": "datum.x + 3"},
                            "y": {"signal": "datum.y + 3"},
                            "width": {"value": 16},
                            "height": {"value": 16},
                            "url": {"field": "iconImg"}
                        },
                        "update": {
                            "opacity": {
                                "signal": "datum.iconImg ? (clickedNode ? datum.opacity : (hoveredNode ? (datum.id === hoveredNode || indata('connectedToHovered', 'connId', datum.id) ? 1 : 0.4) : 1)) : 0"
                            }
                        }
                    }
                },
                // Header text
                {
                    "type": "text",
                    "from": {"data": "nodes"},
                    "encode": {
                        "enter": {
                            "x": {"signal": "datum.hasIcon ? datum.x + 22 : datum.x + 6"},
                            "y": {"signal": "datum.y + 15"},
                            "text": {"field": "headerLabel"},
                            "fontSize": {"value": 11},
                            "fontWeight": {"value": "bold"},
                            "fontFamily": {"value": "monospace"},
                            "fill": {"value": "#ffffff"},
                            "baseline": {"value": "middle"}
                        },
                        "update": {
                            "opacity": {
                                "signal": "clickedNode ? datum.opacity : (hoveredNode ? (datum.id === hoveredNode || indata('connectedToHovered', 'connId', datum.id) ? 1 : 0.4) : 1)"
                            }
                        }
                    }
                },
                // Row text lines
                {
                    "type": "text",
                    "from": {"data": "texts"},
                    "encode": {
                        "enter": {
                            "x": {"field": "x"},
                            "y": {"field": "y"},
                            "text": {"field": "text"},
                            "fontSize": {"value": 10},
                            "fontFamily": {"value": "monospace"},
                            "fill": {"value": "#495057"},
                            "baseline": {"value": "middle"}
                        },
                        "update": {
                            "opacity": {
                                "signal": "clickedNode ? datum.opacity : (hoveredNode ? (datum.nodeId === hoveredNode || indata('connectedToHovered', 'connId', datum.nodeId) ? 1 : 0.35) : 1)"
                            }
                        }
                    }
                },
                // Pivot crosshair icons for pivotable nodes
                {
                    "type": "text",
                    "name": "pivotIcon",
                    "from": {"data": "nodes"},
                    "encode": {
                        "enter": {
                            "x": {"signal": "datum.x + datum.w - 14"},
                            "y": {"signal": "datum.y + 15"},
                            "text": {"signal": "datum.pivotable ? '\u2316' : ''"},
                            "fontSize": {"value": 11},
                            "fontFamily": {"value": "sans-serif"},
                            "fill": {"value": "#ffffff"},
                            "baseline": {"value": "middle"},
                            "cursor": {"signal": "datum.pivotable ? 'pointer' : 'default'"},
                            "opacity": {"signal": "datum.pivotable ? 0.7 : 0"}
                        },
                        "update": {
                            "opacity": {
                                "signal": "datum.pivotable ? (clickedNode ? min(datum.opacity, 0.7) : 0.7) : 0"
                            }
                        }
                    }
                }
            ]
        };

        return spec;
    }

    /* ====================================================================
     * RENDER
     * ==================================================================== */

    function render() {
        if (!DbRel.data) return;
        DbRel.resetTableColors();
        focusedNodeId = null;

        var builtData;
        if (DbRel.displayMode === 'grouped') {
            builtData = buildGroupedData();
        } else {
            builtData = buildSeparateData();
        }
        currentBuiltData = builtData;

        var spec = buildVegaSpec(builtData);

        if (containerEl) containerEl.textContent = '';

        if (vegaView) {
            vegaView.finalize();
            vegaView = null;
        }

        // Ensure fonts are loaded before rendering
        var fontReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
        fontReady.then(function() {
            if (!containerEl) return;
            var runtime = vega.parse(spec);
            vegaView = new vega.View(runtime, {
                renderer: 'svg',
                container: containerEl,
                hover: true
            });

        vegaView.addEventListener('dblclick', function(event, item) {
            if (item && item.datum && item.datum.tableKey !== undefined && item.datum.rowIndex !== undefined) {
                DbRel.showRowModal(item.datum.tableKey, item.datum.rowIndex);
            }
        });

        // Pivot icon click handler
        vegaView.addEventListener('click', function(event, item) {
            if (item && item.mark && item.mark.marktype === 'text' && item.mark.role === 'mark' &&
                item.datum && item.datum.pivotable && item.datum.tableKey !== undefined) {
                // Check if this is the pivot icon by checking position in top-right area
                var el = event.target || event.srcElement;
                if (el && el.textContent === '\u2316') {
                    DbRel.pivotTo(item.datum.tableKey, item.datum.rowIndex);
                }
            }
        });

        vegaView.addSignalListener('clickedNode', function(name, value) {
            focusedNodeId = value;
        });

        vegaView.addSignalListener('hoveredLink', function(name, value) {
            showLinkTooltip(value);
        });

        vegaView.addSignalListener('linkHoverX', function() {});
        vegaView.addSignalListener('linkHoverY', function() {});

            vegaView.run();

            setTimeout(function() {
                vegaFitToScreen();
            }, 100);
        }); // end fontReady.then
    }

    /* ====================================================================
     * ZOOM / FIT / PAN
     * ==================================================================== */

    function vegaFitToScreen() {
        if (!vegaView || !containerEl) return;
        var wW = containerEl.clientWidth;
        var wH = containerEl.clientHeight;
        var cW = vegaView.width();
        var cH = vegaView.height();
        if (cW <= 0 || cH <= 0) return;
        var scaleX = wW / cW;
        var scaleY = wH / cH;
        var scale = Math.min(scaleX, scaleY, 1.5) * 0.95;
        scale = Math.max(scale, 0.02);
        currentScale = scale;
        panX = (wW - cW * scale) / 2;
        panY = (wH - cH * scale) / 2;
        applyTransform();
        DbRel.setZoomSlider(Math.round(currentScale * 100));
    }

    function applyTransform() {
        if (!containerEl) return;
        var svg = containerEl.querySelector('svg');
        if (!svg) return;
        var rootG = svg.querySelector('g.mark-group.root > g');
        if (!rootG) rootG = svg.querySelector('g');
        if (rootG) {
            rootG.setAttribute('transform', 'translate(' + panX + ',' + panY + ') scale(' + currentScale + ')');
        }
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.removeAttribute('width');
        svg.removeAttribute('height');
    }

    function vegaSetZoom(pct) {
        if (!containerEl) return;
        var wW = containerEl.clientWidth;
        var wH = containerEl.clientHeight;
        var newScale = pct / 100;
        var cx = wW / 2;
        var cy = wH / 2;
        panX = cx - (cx - panX) * (newScale / currentScale);
        panY = cy - (cy - panY) * (newScale / currentScale);
        currentScale = newScale;
        applyTransform();
        DbRel.setZoomSlider(Math.round(currentScale * 100));
    }

    function setupPan() {
        if (!containerEl) return;
        var isPanning = false;
        var startX = 0, startY = 0, startPanX = 0, startPanY = 0;

        containerEl.addEventListener('mousedown', function(e) {
            if (e.button !== 0) return;
            var tag = e.target.tagName.toLowerCase();
            if (tag === 'svg' || (tag === 'rect' && e.target.classList.contains('background'))) {
                isPanning = true;
                startX = e.clientX;
                startY = e.clientY;
                startPanX = panX;
                startPanY = panY;
                containerEl.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        vegaDocMoveHandler = function(e) {
            if (!isPanning) return;
            panX = startPanX + (e.clientX - startX);
            panY = startPanY + (e.clientY - startY);
            applyTransform();
        };
        document.addEventListener('mousemove', vegaDocMoveHandler);

        vegaDocUpHandler = function() {
            isPanning = false;
            if (containerEl) containerEl.style.cursor = 'default';
        };
        document.addEventListener('mouseup', vegaDocUpHandler);

        containerEl.addEventListener('wheel', function(e) {
            e.preventDefault();
            var delta = e.deltaY > 0 ? -5 : 5;
            var newPct = Math.max(5, Math.min(300, Math.round(currentScale * 100) + delta));
            vegaSetZoom(newPct);
        }, { passive: false });
    }

    /* ====================================================================
     * LINK TOOLTIP
     * ==================================================================== */

    function showLinkTooltip(linkDatum) {
        if (!linkDatum) {
            DbRel.hideTooltip();
            return;
        }
        var html = '<strong>' + (linkDatum.fullLabel || '') + '</strong><br>' +
            '<small>' + linkDatum.sourceField + ' &rarr; ' + linkDatum.targetField + '</small><br>' +
            '<small>' + linkDatum.relType + ' | ' + linkDatum.cardinality + '</small>';
        // Position near mouse using last known coords
        var rect = containerEl ? containerEl.getBoundingClientRect() : { left: 0, top: 0 };
        DbRel.showTooltip(html, rect.left + containerEl.clientWidth / 2, rect.top + 20);
    }

    /* ====================================================================
     * CENTER ON TABLE
     * ==================================================================== */

    function centerOnTable(tableKey) {
        if (!currentBuiltData || !containerEl) return;
        var node = currentBuiltData.nodes.find(function(n) { return n.tableKey === tableKey; });
        if (!node) return;
        var wW = containerEl.clientWidth;
        var wH = containerEl.clientHeight;
        panX = wW / 2 - (node.x + node.w / 2) * currentScale;
        panY = wH / 2 - (node.y + node.h / 2) * currentScale;
        applyTransform();
    }

    /* ====================================================================
     * REGISTER RENDERER
     * ==================================================================== */

    DbRel.registerRenderer('vega', {
        init: function(el) {
            containerEl = el;
            setupPan();
        },
        render: function() {
            render();
            DbRel.updateSidebar();
        },
        doLayout: function() {
            render();
        },
        setZoom: function(pct) {
            vegaSetZoom(pct);
        },
        getZoom: function() {
            return Math.round(currentScale * 100);
        },
        fitToScreen: function() {
            vegaFitToScreen();
        },
        applyFilters: function(dbF, typeF) {
            // Vega filters require re-render with filtered data
            if (DbRel.data) render();
        },
        focusNode: function(nid) {
            focusedNodeId = nid;
            if (vegaView && currentBuiltData) {
                // Compute distance-based opacity for each node
                var distances = DbRel.computeNodeDistances(nid);
                var updatedNodes = currentBuiltData.nodes.map(function(n) {
                    var dist = distances[n.id];
                    var opacity = DbRel.distanceToOpacity(dist);
                    return Object.assign({}, n, { opacity: opacity });
                });
                var updatedLinks = currentBuiltData.links.map(function(l) {
                    var sDist = distances[l.source] !== undefined ? distances[l.source] : Infinity;
                    var tDist = distances[l.target] !== undefined ? distances[l.target] : Infinity;
                    var edgeOpacity = DbRel.distanceToOpacity(Math.max(sDist, tDist));
                    return Object.assign({}, l, { opacity: edgeOpacity });
                });
                // Build node opacity map for text items
                var nodeOpacityMap = {};
                updatedNodes.forEach(function(n) { nodeOpacityMap[n.id] = n.opacity; });
                var updatedTexts = currentBuiltData.texts.map(function(t) {
                    return Object.assign({}, t, { opacity: nodeOpacityMap[t.nodeId] !== undefined ? nodeOpacityMap[t.nodeId] : 1 });
                });
                vegaView.signal('clickedNode', nid);
                vegaView.data('nodes', updatedNodes);
                vegaView.data('texts', updatedTexts);
                var paths = computeLinkPaths(updatedNodes, updatedLinks);
                vegaView.data('links', paths);
                vegaView.run();
            }
        },
        unfocusNode: function() {
            focusedNodeId = null;
            if (vegaView && currentBuiltData) {
                // Reset all opacity to 1
                var resetNodes = currentBuiltData.nodes.map(function(n) {
                    return Object.assign({}, n, { opacity: 1 });
                });
                var resetLinks = currentBuiltData.links.map(function(l) {
                    return Object.assign({}, l, { opacity: 1 });
                });
                var resetTexts = currentBuiltData.texts.map(function(t) {
                    return Object.assign({}, t, { opacity: 1 });
                });
                vegaView.signal('clickedNode', null);
                vegaView.data('nodes', resetNodes);
                vegaView.data('texts', resetTexts);
                var paths = computeLinkPaths(resetNodes, resetLinks);
                vegaView.data('links', paths);
                vegaView.run();
            }
        },
        centerOnTable: function(tk) {
            centerOnTable(tk);
        },
        getStats: function() {
            return {
                nodes: currentBuiltData ? currentBuiltData.nodes.length : 0,
                links: currentBuiltData ? currentBuiltData.links.length : 0
            };
        },
        resize: function() {
            if (vegaView && containerEl) {
                setTimeout(vegaFitToScreen, 100);
            }
        },
        highlightTable: function(tk) {
            if (!vegaView || !currentBuiltData) return;
            var connIds = {};
            currentBuiltData.nodes.forEach(function(n) {
                if (n.tableKey === tk) connIds[n.id] = true;
            });
            currentBuiltData.links.forEach(function(l) {
                if (connIds[l.source] || connIds[l.target]) {
                    connIds[l.source] = true;
                    connIds[l.target] = true;
                }
            });
            focusedNodeId = '__table_highlight__';
            vegaView.signal('clickedNode', '__table_highlight__').run();
        },
        clearHighlightTable: function() {
            if (focusedNodeId === '__table_highlight__') {
                focusedNodeId = null;
                if (vegaView) {
                    vegaView.signal('clickedNode', null).run();
                }
            }
        },
        destroy: function() {
            if (vegaDocMoveHandler) { document.removeEventListener('mousemove', vegaDocMoveHandler); vegaDocMoveHandler = null; }
            if (vegaDocUpHandler) { document.removeEventListener('mouseup', vegaDocUpHandler); vegaDocUpHandler = null; }
            if (vegaView) {
                vegaView.finalize();
                vegaView = null;
            }
            currentBuiltData = null;
            focusedNodeId = null;
            currentScale = 1;
            panX = 0; panY = 0;
            if (containerEl) containerEl.textContent = '';
            containerEl = null;
        }
    });

})();
