/**
 * Database Relationships - JointJS Renderer
 * SVG-based graph with orthogonal link routing and custom card shapes.
 * Registers with DbRel shared shell.
 */
(function() {
    'use strict';

    var graph, paper, zoomLevel = 100, containerEl;
    var focusedNodeId = null, savedPositions = {}, didPan = false;

    /* ====================================================================
     * CUSTOM SHAPE
     * ==================================================================== */

    joint.shapes.dbrel = joint.shapes.dbrel || {};
    joint.shapes.dbrel.RowCard = joint.dia.Element.define('dbrel.RowCard', {
        size: { width: 180, height: 50 },
        attrs: {
            root: { cursor: 'move' },
            body: {
                refWidth: '100%', refHeight: '100%',
                fill: '#fff', stroke: '#dee2e6', strokeWidth: 1, rx: 3, ry: 3
            },
            header: { refWidth: '100%', height: DbRel.HDR_H, fill: '#007bff', rx: 3, ry: 3 },
            headerMask: { refWidth: '100%', height: 10, y: 12, fill: '#007bff' },
            headerText: {
                refX: 6, y: 15, fontSize: 10, fontWeight: 'bold',
                fontFamily: 'monospace', fill: '#fff', textAnchor: 'start', text: ''
            }
        }
    }, {
        markup: [
            { tagName: 'rect', selector: 'body' },
            { tagName: 'rect', selector: 'header' },
            { tagName: 'rect', selector: 'headerMask' },
            { tagName: 'text', selector: 'headerText' }
        ]
    });

    /* ====================================================================
     * BUILD GRAPH
     * ==================================================================== */

    function buildGraph() {
        if (!DbRel.data) return;
        savedPositions = {};
        focusedNodeId = null;
        DbRel.resetTableColors();
        paper.freeze();
        graph.resetCells([]);

        if (DbRel.displayMode === 'grouped') {
            buildGrouped();
        } else {
            buildSeparate();
        }

        doLayout();
        routeLinksWithLanes();
        paper.unfreeze();

        setTimeout(function() {
            if (!graph || !paper) return;
            renderRowText();
            fitToScreen();
            DbRel.updateSidebar();
        }, 200);
    }

    /* ====================================================================
     * SEPARATE MODE
     * ==================================================================== */

    function buildSeparate() {
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

                var el = new joint.shapes.dbrel.RowCard({
                    id: nodeId,
                    size: { width: size.w, height: size.h },
                    attrs: {
                        body: { fill: colors.bg, stroke: colors.border },
                        header: { fill: colors.header },
                        headerMask: { fill: colors.header },
                        headerText: { text: headerLabel }
                    }
                });
                el.set('tableKey', tableKey);
                el.set('dbName', dbName);
                el.set('tableName', tableName);
                el.set('rowIndex', ri);
                el.set('textLines', lines);
                graph.addCell(el);
            });
        });

        // Links between specific row boxes
        DbRel.data.relationships.forEach(function(rel) {
            var style = DbRel.LINK_STYLES[rel.type] || DbRel.LINK_STYLES['direct'];
            (rel.matches || []).forEach(function(match) {
                var srcNodeId = rel.source + ':' + match[0];
                if (!graph.getCell(srcNodeId)) return;
                match[1].forEach(function(tgtRowIdx) {
                    var tgtNodeId = rel.target + ':' + tgtRowIdx;
                    if (!graph.getCell(tgtNodeId)) return;
                    var link = new joint.shapes.standard.Link({
                        source: { id: srcNodeId }, target: { id: tgtNodeId },
                        attrs: { line: {
                            stroke: style.stroke, strokeWidth: style.strokeWidth,
                            strokeDasharray: style.strokeDasharray,
                            targetMarker: { type: 'path', fill: 'none', stroke: style.stroke, strokeWidth: 1, d: 'M 0 -4 L 8 0 L 0 4' },
                            sourceMarker: { type: 'none' }
                        }},
                        labels: [{ position: 0.5, attrs: {
                            text: { text: rel.source_field + '\u2192' + rel.target_field, fontSize: 7, fontFamily: 'sans-serif', fill: style.stroke },
                            rect: { fill: '#fff', stroke: 'none', rx: 2, ry: 2 }
                        }}]
                    });
                    link.set('relType', rel.type);
                    link.set('relLabel', rel.label);
                    link.set('relData', rel);
                    graph.addCell(link);
                });
            });
        });
    }

    /* ====================================================================
     * GROUPED MODE
     * ==================================================================== */

    function buildGrouped() {
        var tableKeys = Object.keys(DbRel.data.tables);

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);
            var lines = DbRel.getGroupedLines(tableKey);
            var size = DbRel.computeGroupedNodeSize(tableName, lines);

            var el = new joint.shapes.dbrel.RowCard({
                id: tableKey,
                size: { width: size.w, height: size.h },
                attrs: {
                    body: { fill: colors.bg, stroke: colors.border },
                    header: { fill: colors.header },
                    headerMask: { fill: colors.header },
                    headerText: { text: tableName + ' (' + tableInfo.total + ')' }
                }
            });
            el.set('tableKey', tableKey);
            el.set('dbName', dbName);
            el.set('tableName', tableName);
            el.set('rowIndex', 0);
            el.set('textLines', lines);
            graph.addCell(el);
        });

        DbRel.data.relationships.forEach(function(rel) {
            if (!graph.getCell(rel.source) || !graph.getCell(rel.target)) return;
            var style = DbRel.LINK_STYLES[rel.type] || DbRel.LINK_STYLES['direct'];
            var targetMany = rel.cardinality.split(':')[1] === 'N' || rel.cardinality.split(':')[1] === 'M';
            var sourceMany = rel.cardinality === 'M:N' || rel.cardinality === 'N:1';
            var link = new joint.shapes.standard.Link({
                source: { id: rel.source }, target: { id: rel.target },
                attrs: { line: {
                    stroke: style.stroke, strokeWidth: style.strokeWidth, strokeDasharray: style.strokeDasharray,
                    targetMarker: { type: 'path', fill: 'none', stroke: style.stroke, strokeWidth: 1.5,
                        d: targetMany ? 'M 0 -6 L 12 0 L 0 6 M 5 -6 L 17 0 L 5 6' : 'M 5 -6 L 5 6' },
                    sourceMarker: { type: 'path', fill: 'none', stroke: style.stroke, strokeWidth: 1.5,
                        d: sourceMany ? 'M 0 -6 L 12 0 L 0 6 M 5 -6 L 17 0 L 5 6' : 'M 5 -6 L 5 6' }
                }},
                labels: [{ position: 0.5, attrs: {
                    text: { text: rel.label, fontSize: 8, fontFamily: 'sans-serif', fill: style.stroke },
                    rect: { fill: '#fff', stroke: 'none', rx: 2, ry: 2 }
                }}]
            });
            link.set('relType', rel.type);
            link.set('relLabel', rel.label);
            link.set('relData', rel);
            graph.addCell(link);
        });
    }

    /* ====================================================================
     * ORTHOGONAL LINK ROUTING
     * ==================================================================== */

    function routeLinksWithLanes() {
        var LANE_GAP = 6, EXIT_PAD = 15, BOX_PAD = 8;

        var allBounds = [], elBounds = {};
        graph.getElements().forEach(function(el) {
            var p = el.position(), s = el.size();
            var b = { id: el.id, x: p.x, y: p.y, w: s.width, h: s.height,
                cx: p.x + s.width / 2, cy: p.y + s.height / 2,
                r: p.x + s.width, b: p.y + s.height };
            elBounds[el.id] = b;
            allBounds.push(b);
        });

        var sourceGroups = {}, targetGroups = {};
        graph.getLinks().forEach(function(link) {
            var sId = link.source().id, tId = link.target().id;
            if (!sId || !tId || !elBounds[sId] || !elBounds[tId]) return;
            if (!sourceGroups[sId]) sourceGroups[sId] = [];
            sourceGroups[sId].push(link);
            if (!targetGroups[tId]) targetGroups[tId] = [];
            targetGroups[tId].push(link);
        });

        Object.keys(sourceGroups).forEach(function(sId) {
            sourceGroups[sId].sort(function(a, b) {
                var aB = elBounds[a.target().id], bB = elBounds[b.target().id];
                return (aB ? aB.cy : 0) - (bB ? bB.cy : 0);
            });
        });
        Object.keys(targetGroups).forEach(function(tId) {
            targetGroups[tId].sort(function(a, b) {
                var aB = elBounds[a.source().id], bB = elBounds[b.source().id];
                return (aB ? aB.cy : 0) - (bB ? bB.cy : 0);
            });
        });

        function corridorHitsBox(cx, yMin, yMax, skipIds) {
            for (var i = 0; i < allBounds.length; i++) {
                var b = allBounds[i];
                if (skipIds[b.id]) continue;
                if (cx >= b.x - BOX_PAD && cx <= b.r + BOX_PAD &&
                    yMin <= b.b + BOX_PAD && yMax >= b.y - BOX_PAD) return true;
            }
            return false;
        }

        function findClearCorridorX(idealX, yMin, yMax, skipIds) {
            if (!corridorHitsBox(idealX, yMin, yMax, skipIds)) return idealX;
            for (var offset = 10; offset < 500; offset += 8) {
                if (!corridorHitsBox(idealX + offset, yMin, yMax, skipIds)) return idealX + offset;
                if (!corridorHitsBox(idealX - offset, yMin, yMax, skipIds)) return idealX - offset;
            }
            return idealX;
        }

        function horizontalHitsBox(hy, xMin, xMax, skipIds) {
            for (var i = 0; i < allBounds.length; i++) {
                var b = allBounds[i];
                if (skipIds[b.id]) continue;
                if (hy >= b.y - BOX_PAD && hy <= b.b + BOX_PAD &&
                    xMin <= b.r + BOX_PAD && xMax >= b.x - BOX_PAD) return true;
            }
            return false;
        }

        function findClearHorizontalY(idealY, xMin, xMax, skipIds) {
            if (!horizontalHitsBox(idealY, xMin, xMax, skipIds)) return idealY;
            for (var offset = 8; offset < 300; offset += 6) {
                if (!horizontalHitsBox(idealY - offset, xMin, xMax, skipIds)) return idealY - offset;
                if (!horizontalHitsBox(idealY + offset, xMin, xMax, skipIds)) return idealY + offset;
            }
            return idealY;
        }

        var corridorLanes = {};

        graph.getLinks().forEach(function(link) {
            var sId = link.source().id, tId = link.target().id;
            if (!sId || !tId) return;
            var sB = elBounds[sId], tB = elBounds[tId];
            if (!sB || !tB) return;

            var skipSource = {}; skipSource[sId] = true;
            var skipTarget = {}; skipTarget[tId] = true;
            var skipBoth = {}; skipBoth[sId] = true; skipBoth[tId] = true;

            var sGroup = sourceGroups[sId] || [link];
            var tGroup = targetGroups[tId] || [link];
            var sIdx = sGroup.indexOf(link);
            var tIdx = tGroup.indexOf(link);

            var sSpread = Math.min(sB.h * 0.8, sGroup.length * LANE_GAP);
            var sStep = sGroup.length > 1 ? sSpread / (sGroup.length - 1) : 0;
            var exitY = sB.cy + (sIdx - (sGroup.length - 1) / 2) * sStep;

            var tSpread = Math.min(tB.h * 0.8, tGroup.length * LANE_GAP);
            var tStep = tGroup.length > 1 ? tSpread / (tGroup.length - 1) : 0;
            var enterY = tB.cy + (tIdx - (tGroup.length - 1) / 2) * tStep;

            var sideCombos = [
                { exitSide: 'right', enterSide: 'left',  exitX: sB.r,  enterX: tB.x },
                { exitSide: 'right', enterSide: 'right', exitX: sB.r,  enterX: tB.r },
                { exitSide: 'left',  enterSide: 'left',  exitX: sB.x,  enterX: tB.x },
                { exitSide: 'left',  enterSide: 'right', exitX: sB.x,  enterX: tB.r }
            ];

            var bestCombo = null, bestScore = Infinity;
            sideCombos.forEach(function(combo) {
                var ex = combo.exitX, en = combo.enterX;
                var padX1 = combo.exitSide === 'right' ? ex + EXIT_PAD : ex - EXIT_PAD;
                var padX2 = combo.enterSide === 'left' ? en - EXIT_PAD : en + EXIT_PAD;
                var midX = (padX1 + padX2) / 2;
                var exitThruSelf = (combo.exitSide === 'left' && midX > sB.x) ||
                                   (combo.exitSide === 'right' && midX < sB.r);
                var enterThruSelf = (combo.enterSide === 'right' && midX < tB.r) ||
                                    (combo.enterSide === 'left' && midX > tB.x);
                if (exitThruSelf || enterThruSelf) return;
                var dist = Math.abs(ex - en) + Math.abs(exitY - enterY);
                if (dist < bestScore) { bestScore = dist; bestCombo = combo; }
            });

            if (!bestCombo) {
                bestCombo = sB.cx < tB.cx
                    ? { exitSide: 'right', enterSide: 'left', exitX: sB.r, enterX: tB.x }
                    : { exitSide: 'left', enterSide: 'right', exitX: sB.x, enterX: tB.r };
            }

            var exitX = bestCombo.exitX, enterX = bestCombo.enterX;
            var exitSide = bestCombo.exitSide, enterSide = bestCombo.enterSide;
            var padX1 = exitSide === 'right' ? exitX + EXIT_PAD : exitX - EXIT_PAD;
            var padX2 = enterSide === 'left' ? enterX - EXIT_PAD : enterX + EXIT_PAD;

            var idealCorridorX = (padX1 + padX2) / 2;
            var corridorKey = Math.round(idealCorridorX / 40) * 40;
            if (!corridorLanes[corridorKey]) corridorLanes[corridorKey] = 0;
            var laneNum = corridorLanes[corridorKey]++;
            var laneIdealX = idealCorridorX + (laneNum - corridorLanes[corridorKey] / 2) * LANE_GAP;

            var routeYMin = Math.min(exitY, enterY);
            var routeYMax = Math.max(exitY, enterY);
            var laneX = findClearCorridorX(laneIdealX, routeYMin, routeYMax, skipBoth);

            var vertices;
            if (Math.abs(exitY - enterY) < 3 && Math.abs(exitX - enterX) > 20) {
                var straightY = findClearHorizontalY(exitY, Math.min(exitX, enterX), Math.max(exitX, enterX), skipBoth);
                if (Math.abs(straightY - exitY) < 3) {
                    vertices = [];
                } else {
                    vertices = [
                        { x: padX1, y: exitY }, { x: padX1, y: straightY },
                        { x: padX2, y: straightY }, { x: padX2, y: enterY }
                    ];
                }
            } else {
                var clearExitY = findClearHorizontalY(exitY, Math.min(padX1, laneX), Math.max(padX1, laneX), skipSource);
                var clearEnterY = findClearHorizontalY(enterY, Math.min(laneX, padX2), Math.max(laneX, padX2), skipTarget);
                vertices = [
                    { x: padX1, y: clearExitY }, { x: laneX, y: clearExitY },
                    { x: laneX, y: clearEnterY }, { x: padX2, y: clearEnterY }
                ];
            }

            link.source({ id: sId, anchor: { name: exitSide, args: { dy: exitY - sB.cy } } });
            link.target({ id: tId, anchor: { name: enterSide, args: { dy: enterY - tB.cy } } });
            link.vertices(vertices);
        });
    }

    /* ====================================================================
     * RENDER ROW TEXT (SVG text elements on each card)
     * ==================================================================== */

    function renderRowText() {
        if (!graph || !paper) return;
        var svgNs = 'http://www.w3.org/2000/svg';
        graph.getElements().forEach(function(el) {
            var lines = el.get('textLines') || [];
            var view = paper.findViewByModel(el);
            if (!view) return;
            $(view.el).find('.dbrel-row-text,.dbrel-pivot-icon,.dbrel-table-icon').remove();

            // Table icon in header
            var tblName = el.get('tableName');
            var iconInfo = tblName ? DbRel.getTableIconInfo(tblName) : null;
            if (iconInfo && iconInfo.src) {
                var iconImg = document.createElementNS(svgNs, 'image');
                iconImg.setAttribute('class', 'dbrel-table-icon');
                iconImg.setAttributeNS('http://www.w3.org/1999/xlink', 'href', iconInfo.src);
                iconImg.setAttribute('x', '3');
                iconImg.setAttribute('y', '3');
                iconImg.setAttribute('width', '16');
                iconImg.setAttribute('height', '16');
                iconImg.setAttribute('pointer-events', 'none');
                view.el.appendChild(iconImg);
                // Shift header text right
                var hdrTextEl = view.el.querySelector('[joint-selector="headerText"]');
                if (hdrTextEl) hdrTextEl.setAttribute('x', '22');
            }

            lines.forEach(function(line, i) {
                var txt = document.createElementNS(svgNs, 'text');
                txt.setAttribute('class', 'dbrel-row-text');
                txt.setAttribute('x', '6');
                txt.setAttribute('y', String(DbRel.HDR_H + DbRel.PAD + (i + 1) * DbRel.ROW_H));
                txt.setAttribute('font-size', '10');
                txt.setAttribute('font-family', 'monospace');
                txt.setAttribute('fill', '#495057');
                txt.setAttribute('pointer-events', 'none');
                txt.textContent = line;
                view.el.appendChild(txt);
            });

            // Add pivot icon for pivotable tables
            var tableKey = el.get('tableKey');
            var rowIndex = el.get('rowIndex');
            var pivotInfo = DbRel.getNodePivotInfo(tableKey, rowIndex);
            if (pivotInfo) {
                var sz = el.size();
                var icon = document.createElementNS(svgNs, 'text');
                icon.setAttribute('class', 'dbrel-pivot-icon');
                icon.setAttribute('x', String(sz.width - 14));
                icon.setAttribute('y', '14');
                icon.setAttribute('font-size', '11');
                icon.setAttribute('font-family', 'sans-serif');
                icon.setAttribute('fill', '#fff');
                icon.setAttribute('cursor', 'pointer');
                icon.setAttribute('pointer-events', 'all');
                icon.setAttribute('opacity', '0.6');
                icon.textContent = '\u2316'; // crosshairs
                icon.setAttribute('data-table-key', tableKey);
                icon.setAttribute('data-row-index', String(rowIndex));
                icon.addEventListener('mouseenter', function() { this.setAttribute('opacity', '1'); });
                icon.addEventListener('mouseleave', function() { this.setAttribute('opacity', '0.6'); });
                icon.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var tk = this.getAttribute('data-table-key');
                    var ri = parseInt(this.getAttribute('data-row-index'), 10);
                    DbRel.pivotTo(tk, ri);
                });
                view.el.appendChild(icon);
            }
        });
    }

    /* ====================================================================
     * LAYOUT
     * ==================================================================== */

    function doLayout() {
        var wrap = document.getElementById('db-rel-paper-wrap');
        var cw = wrap ? wrap.clientWidth : 1200;
        var ch = wrap ? wrap.clientHeight : 700;
        var positions = DbRel.computeLayout(cw, ch);

        Object.keys(positions).forEach(function(nid) {
            var el = graph.getCell(nid);
            if (el) el.position(positions[nid].x, positions[nid].y);
        });

        routeLinksWithLanes();
        fitToScreen();
    }

    /* ====================================================================
     * ZOOM / PAN / FIT
     * ==================================================================== */

    function setZoom(pct) {
        zoomLevel = pct;
        paper.scale(pct / 100, pct / 100);
        DbRel.setZoomSlider(pct);
    }

    function fitToScreen() {
        if (!paper) return;
        paper.scaleContentToFit({ padding: 20, maxScale: 1.5, minScale: 0.02 });
        zoomLevel = Math.round(paper.scale().sx * 100);
        DbRel.setZoomSlider(zoomLevel);
    }

    /* ====================================================================
     * FILTERS
     * ==================================================================== */

    function applyFilters(dbF, typeF) {
        graph.getElements().forEach(function(el) {
            var v = paper.findViewByModel(el);
            if (v) v.el.style.display = dbF[el.get('dbName')] !== false ? '' : 'none';
        });
        graph.getLinks().forEach(function(lnk) {
            var rd = lnk.get('relData'), rt = lnk.get('relType');
            if (!rd) return;
            var vis = typeF[rt] !== false && dbF[rd.source.split('.')[0]] !== false && dbF[rd.target.split('.')[0]] !== false;
            var v = paper.findViewByModel(lnk);
            if (v) v.el.style.display = vis ? '' : 'none';
        });
    }

    /* ====================================================================
     * INTERACTIONS
     * ==================================================================== */

    function setupInteractions() {
        paper.on('element:mouseenter', function(ev) {
            if (focusedNodeId) return;
            var elId = ev.model.id;
            ev.el.classList.add('db-rel-el-highlight');
            graph.getLinks().forEach(function(lnk) {
                var s = lnk.source().id, t = lnk.target().id;
                if (s === elId || t === elId) {
                    var lv = paper.findViewByModel(lnk);
                    if (lv) lv.el.classList.add('db-rel-link-highlight');
                    var ov = paper.findViewByModel(graph.getCell(s === elId ? t : s));
                    if (ov) ov.el.classList.add('db-rel-el-highlight');
                }
            });
        });
        paper.on('element:mouseleave', function() {
            if (focusedNodeId) return;
            clearHighlights();
        });

        paper.on('element:pointerclick', function(ev) {
            var elId = ev.model.id;
            if (focusedNodeId === elId) { unfocusNode(); return; }
            focusNode(elId);
        });

        paper.on('element:pointerdblclick', function(ev) {
            var tk = ev.model.get('tableKey');
            var ri = ev.model.get('rowIndex');
            if (tk === undefined || ri === undefined) return;
            DbRel.showRowModal(tk, ri);
        });

        paper.on('blank:pointerup', function() {
            if (focusedNodeId && !didPan) unfocusNode();
        });

        paper.on('link:mouseenter', function(lv, evt) {
            var link = lv.model;
            var sId = link.source().id, tId = link.target().id;
            lv.el.classList.add('db-rel-link-highlight');
            if (sId) { var sv = paper.findViewByModel(graph.getCell(sId)); if (sv) sv.el.classList.add('db-rel-el-highlight'); }
            if (tId) { var tv = paper.findViewByModel(graph.getCell(tId)); if (tv) tv.el.classList.add('db-rel-el-highlight'); }
            var rd = link.get('relData');
            if (rd) DbRel.showTooltip(DbRel.getLinkTooltipHtml(rd), evt.clientX, evt.clientY);
        });
        paper.on('link:mouseleave', function() {
            DbRel.hideTooltip();
            if (!focusedNodeId) clearHighlights();
        });
    }

    function focusNode(elId) {
        if (focusedNodeId && focusedNodeId !== elId) restorePositions();
        focusedNodeId = elId;
        clearHighlights();

        var focusEl = graph.getCell(elId);
        if (!focusEl) return;

        var connectedIds = {};
        connectedIds[elId] = true;
        graph.getLinks().forEach(function(lnk) {
            var s = lnk.source().id, t = lnk.target().id;
            if (s === elId || t === elId) { connectedIds[s] = true; connectedIds[t] = true; }
        });

        var focusPos = focusEl.position(), focusSz = focusEl.size();
        var centerX = focusPos.x + focusSz.width / 2, centerY = focusPos.y + focusSz.height / 2;

        var neighbors = [];
        graph.getElements().forEach(function(el) {
            if (el.id !== elId && connectedIds[el.id]) neighbors.push(el);
        });

        savedPositions = {};
        neighbors.forEach(function(el) { var p = el.position(); savedPositions[el.id] = { x: p.x, y: p.y }; });

        var radius = Math.max(200, neighbors.length * 30);
        var angleStep = (2 * Math.PI) / Math.max(neighbors.length, 1);
        neighbors.forEach(function(el, i) {
            var angle = -Math.PI / 2 + i * angleStep;
            var sz = el.size();
            el.position(centerX + radius * Math.cos(angle) - sz.width / 2,
                        centerY + radius * Math.sin(angle) - sz.height / 2);
        });

        // Distance-based graduated opacity
        var distances = DbRel.computeNodeDistances(elId);
        graph.getElements().forEach(function(el) {
            var view = paper.findViewByModel(el);
            if (!view) return;
            var dist = distances[el.id];
            var opacity = DbRel.distanceToOpacity(dist);
            view.el.classList.remove('db-rel-el-highlight', 'db-rel-el-dimmed');
            if (dist === 0) { view.el.classList.add('db-rel-el-highlight'); }
            else if (dist === 1) { view.el.classList.add('db-rel-el-highlight'); }
            view.el.style.opacity = opacity;
        });
        graph.getLinks().forEach(function(lnk) {
            var s = lnk.source().id, t = lnk.target().id;
            var view = paper.findViewByModel(lnk);
            if (!view) return;
            var sDist = distances[s] !== undefined ? distances[s] : Infinity;
            var tDist = distances[t] !== undefined ? distances[t] : Infinity;
            var linkDist = Math.max(sDist, tDist);
            var opacity = DbRel.distanceToOpacity(linkDist);
            view.el.classList.remove('db-rel-link-highlight', 'db-rel-link-dimmed');
            if (linkDist <= 1) view.el.classList.add('db-rel-link-highlight');
            view.el.style.opacity = opacity;
        });

        var allConnected = [focusEl].concat(neighbors);
        var bbox = computeBBox(allConnected);
        var ps = paper.getComputedSize();
        var padded = { x: bbox.x - 40, y: bbox.y - 40, w: bbox.w + 80, h: bbox.h + 80 };
        var newScale = Math.min(ps.width / padded.w, ps.height / padded.h, 1.5);
        newScale = Math.max(newScale, 0.1);
        paper.scale(newScale, newScale);
        zoomLevel = Math.round(newScale * 100);
        DbRel.setZoomSlider(zoomLevel);
        paper.translate(
            ps.width / 2 - (bbox.x + bbox.w / 2) * newScale,
            ps.height / 2 - (bbox.y + bbox.h / 2) * newScale
        );
        renderRowText();
    }

    function unfocusNode() {
        restorePositions();
        focusedNodeId = null;
        clearHighlights();
        paper.$el.find('.db-rel-el-dimmed').removeClass('db-rel-el-dimmed');
        paper.$el.find('.db-rel-link-dimmed').removeClass('db-rel-link-dimmed');
        // Clear inline opacity set by distance-based fading
        graph.getElements().forEach(function(el) {
            var v = paper.findViewByModel(el);
            if (v) v.el.style.opacity = '';
        });
        graph.getLinks().forEach(function(lnk) {
            var v = paper.findViewByModel(lnk);
            if (v) v.el.style.opacity = '';
        });
        renderRowText();
    }

    function restorePositions() {
        Object.keys(savedPositions).forEach(function(id) {
            var el = graph.getCell(id);
            if (el) el.position(savedPositions[id].x, savedPositions[id].y);
        });
        savedPositions = {};
    }

    function computeBBox(elements) {
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        elements.forEach(function(el) {
            var p = el.position(), s = el.size();
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x + s.width > maxX) maxX = p.x + s.width;
            if (p.y + s.height > maxY) maxY = p.y + s.height;
        });
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }

    function clearHighlights() {
        paper.$el.find('.db-rel-link-highlight').removeClass('db-rel-link-highlight');
        paper.$el.find('.db-rel-el-highlight').removeClass('db-rel-el-highlight');
    }

    /* ====================================================================
     * CENTER ON TABLE
     * ==================================================================== */

    function centerOnTable(tableKey) {
        var nodeId = DbRel.displayMode === 'grouped' ? tableKey : tableKey + ':0';
        var el = graph.getCell(nodeId);
        if (!el) return;
        var p = el.position(), sz = el.size(), sc = paper.scale().sx, ps = paper.getComputedSize();
        paper.translate(ps.width / 2 - (p.x + sz.width / 2) * sc, ps.height / 2 - (p.y + sz.height / 2) * sc);
    }

    /* ====================================================================
     * INIT PAPER
     * ==================================================================== */

    function initPaper() {
        graph = new joint.dia.Graph({}, { cellNamespace: joint.shapes });
        paper = new joint.dia.Paper({
            el: containerEl, model: graph,
            width: '100%', height: '100%',
            gridSize: 10, drawGrid: { name: 'dot', args: { color: '#e9ecef' } },
            background: { color: '#fff' },
            cellViewNamespace: joint.shapes,
            interactive: { elementMove: true, linkMove: false, labelMove: false },
            async: true, frozen: false,
            defaultConnector: { name: 'rounded', args: { radius: 8 } },
            defaultRouter: { name: 'normal' }
        });

        var panning = false, ps = {}, po = {};
        paper.on('blank:pointerdown', function(evt) {
            if (!paper) return;
            panning = true; didPan = false;
            ps = { x: evt.clientX, y: evt.clientY };
            var t = paper.translate(); po = { x: t.tx, y: t.ty };
            if (containerEl) containerEl.style.cursor = 'grabbing';
        });
        $(document).on('mousemove.dbrel', function(e) {
            if (!panning || !paper) return;
            var dx = e.clientX - ps.x, dy = e.clientY - ps.y;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPan = true;
            paper.translate(po.x + dx, po.y + dy);
        });
        $(document).on('mouseup.dbrel', function() {
            panning = false;
            if (containerEl) containerEl.style.cursor = 'default';
        });
        $(containerEl).on('wheel', function(e) {
            e.preventDefault();
            setZoom(Math.max(5, Math.min(300, (zoomLevel || 100) + (e.originalEvent.deltaY > 0 ? -5 : 5))));
        });

        zoomLevel = 100;
        setupInteractions();

        var rerouteTimer = null;
        paper.on('element:pointerup', function() {
            if (rerouteTimer) clearTimeout(rerouteTimer);
            rerouteTimer = setTimeout(function() { routeLinksWithLanes(); }, 100);
        });

        resizePaper();
    }

    function resizePaper() {
        var w = document.getElementById('db-rel-paper-wrap');
        if (w && paper) {
            var r = w.getBoundingClientRect();
            paper.setDimensions(r.width, Math.max(r.height, 500));
        }
    }

    /* ====================================================================
     * REGISTER RENDERER
     * ==================================================================== */

    DbRel.registerRenderer('jointjs', {
        init: function(el) {
            containerEl = el;
            initPaper();
        },
        render: function() {
            buildGraph();
        },
        doLayout: function() {
            doLayout();
            setTimeout(renderRowText, 300);
        },
        setZoom: function(pct) { setZoom(pct); },
        getZoom: function() { return zoomLevel; },
        fitToScreen: function() { fitToScreen(); },
        applyFilters: function(dbF, typeF) { applyFilters(dbF, typeF); },
        focusNode: function(nid) { focusNode(nid); },
        unfocusNode: function() { unfocusNode(); },
        centerOnTable: function(tk) { centerOnTable(tk); },
        highlightTable: function(tk) {
            if (!graph || !paper) return;
            graph.getElements().forEach(function(el) {
                var v = paper.findViewByModel(el);
                if (!v) return;
                if (el.get('tableKey') === tk) {
                    v.el.classList.add('db-rel-el-highlight');
                    v.el.classList.remove('db-rel-el-dimmed');
                } else {
                    v.el.classList.add('db-rel-el-dimmed');
                    v.el.classList.remove('db-rel-el-highlight');
                }
            });
            graph.getLinks().forEach(function(lnk) {
                var rd = lnk.get('relData');
                var v = paper.findViewByModel(lnk);
                if (!v) return;
                if (rd && (rd.source === tk || rd.target === tk)) {
                    v.el.classList.add('db-rel-link-highlight');
                    v.el.classList.remove('db-rel-link-dimmed');
                } else {
                    v.el.classList.add('db-rel-link-dimmed');
                    v.el.classList.remove('db-rel-link-highlight');
                }
            });
        },
        clearHighlightTable: function() {
            if (!paper) return;
            clearHighlights();
            paper.$el.find('.db-rel-el-dimmed').removeClass('db-rel-el-dimmed');
            paper.$el.find('.db-rel-link-dimmed').removeClass('db-rel-link-dimmed');
        },
        getStats: function() {
            return {
                nodes: graph ? graph.getElements().length : 0,
                links: graph ? graph.getLinks().length : 0
            };
        },
        resize: function() { resizePaper(); },
        destroy: function() {
            $(document).off('.dbrel');
            if (containerEl) $(containerEl).off('wheel');
            if (paper) {
                paper.freeze();
                graph.clear();
                // Don't call paper.remove() - it removes the container element from DOM
                // Instead just clear the SVG content
                if (containerEl) containerEl.innerHTML = '';
            }
            graph = null;
            paper = null;
            focusedNodeId = null;
            savedPositions = {};
        }
    });

})();
