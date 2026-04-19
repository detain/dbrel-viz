/**
 * Database Relationships - XYFlow (React Flow) Renderer
 * Uses @xyflow/react loaded via dynamic ESM import from esm.sh.
 * Full interactive graph with custom card nodes, smoothstep edges,
 * column bin-pack layout, focus/highlight, and minimap.
 * Registers with DbRel shared shell.
 */
(function() {
    'use strict';

    var deps = null;
    var containerEl = null;
    var zoomLevel = 100;
    var focusedNodeId = null;
    var rootEl = null;
    var reactFlowInstance = null;
    var nodeCount = 0;
    var linkCount = 0;
    var loadingEl = null;
    var currentNodes = [];
    var currentEdges = [];
    var rerenderFn = null;

    /* ====================================================================
     * DEPENDENCY LOADING
     * ==================================================================== */

    function loadDeps() {
        if (deps) return Promise.resolve(deps);

        // All UMD globals loaded by the shared shell CDN manifest (CSS too)
        // reactflow UMD exposes window.ReactFlow
        if (!window.React || !window.ReactDOM || !window.ReactFlow) {
            return Promise.reject(new Error('React, ReactDOM, or ReactFlow UMD globals not loaded'));
        }
        deps = {
            React: window.React,
            ReactDOM: window.ReactDOM,
            XYFlow: window.ReactFlow
        };
        return Promise.resolve(deps);
    }

    function showLoading() {
        if (!containerEl) return;
        loadingEl = document.createElement('div');
        loadingEl.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;z-index:100;font-family:sans-serif;';
        loadingEl.innerHTML = '<div style="font-size:14px;color:#666;margin-bottom:8px;">Loading React Flow library...</div>' +
            '<div style="width:40px;height:40px;border:3px solid #dee2e6;border-top-color:#007bff;border-radius:50%;animation:dbrel-spin 1s linear infinite;margin:0 auto;"></div>';
        if (!document.getElementById('dbrel-spin-style')) {
            var style = document.createElement('style');
            style.id = 'dbrel-spin-style';
            style.textContent = '@keyframes dbrel-spin{to{transform:rotate(360deg)}}';
            document.head.appendChild(style);
        }
        containerEl.appendChild(loadingEl);
    }

    function hideLoading() {
        if (loadingEl && loadingEl.parentNode) {
            loadingEl.parentNode.removeChild(loadingEl);
            loadingEl = null;
        }
    }

    /* ====================================================================
     * INJECT CSS
     * ==================================================================== */

    function injectStyles() {
        if (document.getElementById('dbrel-xyflow-styles')) return;
        var style = document.createElement('style');
        style.id = 'dbrel-xyflow-styles';
        style.textContent = [
            '.dbrel-rf-wrapper { width: 100%; height: 100%; }',
            '.dbrel-rf-wrapper .react-flow { height: 100%; }',
            '.dbrel-rf-node { border-radius: 4px; overflow: hidden; font-family: monospace; font-size: 10px; min-width: 150px; max-width: 320px; box-shadow: 0 1px 4px rgba(0,0,0,0.12); transition: box-shadow 0.2s, opacity 0.2s; cursor: grab; }',
            '.dbrel-rf-node:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.25); z-index: 10; }',
            '.dbrel-rf-node.focused { box-shadow: 0 0 0 3px #007bff, 0 2px 12px rgba(0,123,255,0.4); z-index: 20; }',
            '.dbrel-rf-node.dimmed { opacity: 0.12; pointer-events: none; }',
            '.dbrel-rf-node.connected-hl { box-shadow: 0 0 0 2px #007bff, 0 2px 8px rgba(0,123,255,0.3); }',
            '.dbrel-rf-header { padding: 3px 8px; color: #fff; font-weight: bold; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 4px; }',
            '.dbrel-rf-header .badge { font-size: 8px; background: rgba(255,255,255,0.3); color: #fff; padding: 1px 4px; border-radius: 2px; }',
            '.dbrel-rf-body { padding: 3px 6px; font-size: 9.5px; line-height: 1.45; color: #495057; }',
            '.dbrel-rf-body .field-row { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
            '.dbrel-rf-body .field-name { color: #6c757d; }',
            '.dbrel-rf-body .field-value { color: #212529; }',
            '.dbrel-rf-body .more-indicator { color: #adb5bd; font-style: italic; font-size: 9px; }',
            '.dbrel-rf-grouped { border-radius: 4px; overflow: hidden; font-family: monospace; font-size: 10px; min-width: 200px; box-shadow: 0 1px 4px rgba(0,0,0,0.12); transition: box-shadow 0.2s, opacity 0.2s; }',
            '.dbrel-rf-grouped:hover { box-shadow: 0 2px 12px rgba(0,0,0,0.25); }',
            '.dbrel-rf-grouped.focused { box-shadow: 0 0 0 3px #007bff, 0 2px 12px rgba(0,123,255,0.4); }',
            '.dbrel-rf-grouped.dimmed { opacity: 0.12; pointer-events: none; }',
            '.dbrel-rf-grouped.connected-hl { box-shadow: 0 0 0 2px #007bff, 0 2px 8px rgba(0,123,255,0.3); }',
            '.dbrel-rf-grouped-header { padding: 4px 8px; color: #fff; font-weight: bold; font-size: 11px; }',
            '.dbrel-rf-grouped-body { padding: 4px 6px; font-size: 9px; line-height: 1.5; color: #495057; max-height: 350px; overflow-y: auto; }',
            '.dbrel-rf-grouped-body .grouped-hdr { font-weight: bold; color: #343a40; border-bottom: 1px solid #dee2e6; padding-bottom: 2px; margin-bottom: 2px; }',
            '.dbrel-rf-grouped-body .grouped-row { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
            '.dbrel-rf-grouped-body .grouped-row:nth-child(odd) { background: rgba(0,0,0,0.02); }',
            '.react-flow__edge.highlighted path { stroke-width: 3px !important; }',
            '.react-flow__edge.dimmed path { opacity: 0.06 !important; }',
            '.dbrel-rf-tooltip { position: fixed; background: #343a40; color: #fff; padding: 8px 12px; border-radius: 4px; font-size: 11px; line-height: 1.5; z-index: 10000; pointer-events: none; max-width: 350px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); white-space: pre-line; }'
        ].join('\n');
        document.head.appendChild(style);
    }

    /* ====================================================================
     * ESCAPE HELPER
     * ==================================================================== */

    function escHtml(s) {
        var d = document.createElement('span');
        d.textContent = String(s || '');
        return d.innerHTML;
    }

    /* ====================================================================
     * BUILD NODES AND EDGES
     * ==================================================================== */

    function buildSeparateNodesEdges() {
        var nodes = [];
        var edges = [];
        var tableKeys = Object.keys(DbRel.data.tables);

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);

            tableInfo.rows.forEach(function(row, ri) {
                var nodeId = tableKey + ':' + ri;
                var header = DbRel.getNodeHeader(tableKey, ri);
                var lines = DbRel.getNodeLines(tableKey, ri);
                var size = DbRel.computeNodeSize(header, lines);

                nodes.push({
                    id: nodeId,
                    type: 'rowCard',
                    position: { x: 0, y: 0 },
                    data: {
                        headerLabel: header,
                        lines: lines,
                        colors: colors,
                        dbName: dbName,
                        tableName: tableName,
                        tableKey: tableKey,
                        rowIndex: ri,
                        nodeWidth: size.w,
                        nodeHeight: size.h,
                        _focused: false,
                        _dimmed: false,
                        _connHighlight: false
                    }
                });
                nodeCount++;
            });
        });

        // Edges
        DbRel.data.relationships.forEach(function(rel, relIdx) {
            var ls = DbRel.LINK_STYLES[rel.type] || DbRel.LINK_STYLES['direct'];
            (rel.matches || []).forEach(function(match, mIdx) {
                var srcNodeId = rel.source + ':' + match[0];
                var hasSource = false;
                for (var ni = 0; ni < nodes.length; ni++) {
                    if (nodes[ni].id === srcNodeId) { hasSource = true; break; }
                }
                if (!hasSource) return;

                match[1].forEach(function(tgtRowIdx, tIdx) {
                    var tgtNodeId = rel.target + ':' + tgtRowIdx;
                    var hasTarget = false;
                    for (var ni = 0; ni < nodes.length; ni++) {
                        if (nodes[ni].id === tgtNodeId) { hasTarget = true; break; }
                    }
                    if (!hasTarget) return;

                    edges.push({
                        id: 'e_' + relIdx + '_' + mIdx + '_' + tIdx,
                        source: tgtNodeId,
                        target: srcNodeId,
                        type: 'smoothstep',
                        animated: true,
                        style: {
                            stroke: ls.stroke,
                            strokeWidth: ls.strokeWidth,
                            strokeDasharray: ls.strokeDasharray === '0' ? undefined : ls.strokeDasharray
                        },
                        markerEnd: { type: 'arrowclosed', color: ls.stroke, width: 12, height: 12 },
                        label: rel.source_field + '\u2192' + rel.target_field,
                        labelStyle: { fontSize: 7, fontFamily: 'monospace', fill: ls.stroke },
                        labelBgStyle: { fill: '#fff', fillOpacity: 0.85 },
                        labelBgPadding: [3, 2],
                        data: { relType: rel.type, relLabel: rel.label, relData: rel }
                    });
                    linkCount++;
                });
            });
        });

        return { nodes: nodes, edges: edges };
    }

    function buildGroupedNodesEdges() {
        var nodes = [];
        var edges = [];
        var tableKeys = Object.keys(DbRel.data.tables);

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);
            var lines = DbRel.getGroupedLines(tableKey);
            var size = DbRel.computeGroupedNodeSize(tableName, lines);

            nodes.push({
                id: tableKey,
                type: 'groupedCard',
                position: { x: 0, y: 0 },
                data: {
                    tableName: tableName,
                    tableKey: tableKey,
                    dbName: dbName,
                    colors: colors,
                    total: tableInfo.total,
                    lines: lines,
                    nodeWidth: size.w,
                    nodeHeight: size.h,
                    _focused: false,
                    _dimmed: false,
                    _connHighlight: false
                }
            });
            nodeCount++;
        });

        var edgeSet = {};
        DbRel.data.relationships.forEach(function(rel, relIdx) {
            var edgeKey = rel.source + '->' + rel.target + '::' + rel.type;
            if (edgeSet[edgeKey]) return;
            edgeSet[edgeKey] = true;

            var srcExists = false, tgtExists = false;
            for (var ni = 0; ni < nodes.length; ni++) {
                if (nodes[ni].id === rel.source) srcExists = true;
                if (nodes[ni].id === rel.target) tgtExists = true;
            }
            if (!srcExists || !tgtExists) return;

            var ls = DbRel.LINK_STYLES[rel.type] || DbRel.LINK_STYLES['direct'];
            edges.push({
                id: 'ge_' + relIdx,
                source: rel.target,
                target: rel.source,
                type: 'smoothstep',
                animated: true,
                style: {
                    stroke: ls.stroke,
                    strokeWidth: ls.strokeWidth,
                    strokeDasharray: ls.strokeDasharray === '0' ? undefined : ls.strokeDasharray
                },
                markerEnd: { type: 'arrowclosed', color: ls.stroke, width: 14, height: 14 },
                label: rel.label,
                labelStyle: { fontSize: 8, fontFamily: 'sans-serif', fill: ls.stroke },
                labelBgStyle: { fill: '#fff', fillOpacity: 0.85 },
                labelBgPadding: [4, 2],
                data: { relType: rel.type, relLabel: rel.label, relData: rel }
            });
            linkCount++;
        });

        return { nodes: nodes, edges: edges };
    }

    /* ====================================================================
     * LAYOUT (use DbRel.computeLayout)
     * ==================================================================== */

    function applyLayoutToNodes(nodes) {
        var layout = DbRel.computeLayout(
            containerEl ? containerEl.clientWidth : 1200,
            containerEl ? containerEl.clientHeight : 700
        );
        if (!layout) return nodes;

        return nodes.map(function(n) {
            var pos = layout[n.id];
            if (pos) {
                return Object.assign({}, n, { position: { x: pos.x, y: pos.y } });
            }
            return n;
        });
    }

    /* ====================================================================
     * REACT COMPONENT
     * ==================================================================== */

    function buildAndRender() {
        if (!DbRel.data || !deps) return;

        var React = deps.React;
        var ReactDOM = deps.ReactDOM;
        var XYFlow = deps.XYFlow;
        var h = React.createElement;

        nodeCount = 0;
        linkCount = 0;
        DbRel.resetTableColors();

        var result;
        if (DbRel.displayMode === 'grouped') {
            result = buildGroupedNodesEdges();
        } else {
            result = buildSeparateNodesEdges();
        }

        currentNodes = applyLayoutToNodes(result.nodes);
        currentEdges = result.edges;

        // Custom Node: Row Card
        function RowCardNode(props) {
            var data = props.data;
            var colors = data.colors;
            var cls = 'dbrel-rf-node';
            if (data._focused) cls += ' focused';
            if (data._dimmed) cls += ' dimmed';
            if (data._connHighlight) cls += ' connected-hl';

            var Handle = XYFlow.Handle;
            var Position = XYFlow.Position;

            var fieldRows = [];
            var lines = data.lines || [];
            for (var i = 0; i < lines.length; i++) {
                var parts = lines[i].split(': ');
                var fname = parts[0] || '';
                var fval = parts.slice(1).join(': ');
                fieldRows.push(
                    h('div', { key: i, className: 'field-row' },
                        h('span', { className: 'field-name' }, fname + ': '),
                        h('span', { className: 'field-value' }, fval)
                    )
                );
            }
            if (lines.length === 0) {
                fieldRows.push(h('div', { key: 'empty', className: 'more-indicator' }, '(no fields)'));
            }

            var headerChildren = [];
            var iconInfo = data.tableName ? DbRel.getTableIconInfo(data.tableName) : null;
            if (iconInfo && iconInfo.src) {
                headerChildren.push(h('img', { key: 'icon', src: iconInfo.src, className: 'db-rel-tbl-icon', style: { width: '15px', height: '15px', marginRight: '3px', verticalAlign: 'middle' } }));
            }
            headerChildren.push(data.headerLabel);
            headerChildren.push(h('span', { className: 'badge' }, data.dbName));

            // Pivot icon for pivotable tables
            var pivotInfo = DbRel.getNodePivotInfo(data.tableKey, data.rowIndex);
            if (pivotInfo) {
                headerChildren.push(
                    h('span', {
                        style: { marginLeft: 'auto', cursor: 'pointer', opacity: 0.7, fontFamily: 'sans-serif', fontSize: '11px' },
                        title: 'Pivot',
                        onClick: function(e) {
                            e.stopPropagation();
                            DbRel.pivotTo(data.tableKey, data.rowIndex);
                        },
                        onMouseEnter: function(e) { e.target.style.opacity = '1'; },
                        onMouseLeave: function(e) { e.target.style.opacity = '0.7'; }
                    }, '\u2316')
                );
            }

            var nodeStyle = { background: colors.bg, border: '1px solid ' + colors.border };
            if (data._opacity !== undefined && data._opacity < 1) {
                nodeStyle.opacity = data._opacity;
            }

            return h('div', { className: cls, style: nodeStyle },
                h(Handle, { type: 'target', position: Position.Left, style: { background: colors.header, width: 6, height: 6 } }),
                h(Handle, { type: 'source', position: Position.Right, style: { background: colors.header, width: 6, height: 6 } }),
                h('div', { className: 'dbrel-rf-header', style: { background: colors.header } }, headerChildren),
                h('div', { className: 'dbrel-rf-body' }, fieldRows)
            );
        }

        // Custom Node: Grouped Card
        function GroupedCardNode(props) {
            var data = props.data;
            var colors = data.colors;
            var cls = 'dbrel-rf-grouped';
            if (data._focused) cls += ' focused';
            if (data._dimmed) cls += ' dimmed';
            if (data._connHighlight) cls += ' connected-hl';

            var Handle = XYFlow.Handle;
            var Position = XYFlow.Position;

            var lines = data.lines || [];
            var bodyLines = [];
            for (var i = 0; i < lines.length; i++) {
                var lineClass = i === 0 ? 'grouped-hdr' : 'grouped-row';
                bodyLines.push(h('div', { key: i, className: lineClass }, lines[i]));
            }

            var grpHeaderChildren = [];
            var grpIconInfo = data.tableName ? DbRel.getTableIconInfo(data.tableName) : null;
            if (grpIconInfo && grpIconInfo.src) {
                grpHeaderChildren.push(h('img', { key: 'icon', src: grpIconInfo.src, className: 'db-rel-tbl-icon', style: { width: '15px', height: '15px', marginRight: '3px', verticalAlign: 'middle' } }));
            }
            grpHeaderChildren.push(data.tableName + ' (' + data.total + ')');

            // Pivot icon for pivotable tables
            var grpPivotInfo = DbRel.getNodePivotInfo(data.tableKey, 0);
            if (grpPivotInfo) {
                grpHeaderChildren.push(
                    h('span', {
                        style: { float: 'right', cursor: 'pointer', opacity: 0.7, fontFamily: 'sans-serif', fontSize: '11px' },
                        title: 'Pivot',
                        onClick: function(e) {
                            e.stopPropagation();
                            DbRel.pivotTo(data.tableKey, 0);
                        },
                        onMouseEnter: function(e) { e.target.style.opacity = '1'; },
                        onMouseLeave: function(e) { e.target.style.opacity = '0.7'; }
                    }, '\u2316')
                );
            }

            var grpStyle = { background: colors.bg, border: '1px solid ' + colors.border };
            if (data._opacity !== undefined && data._opacity < 1) {
                grpStyle.opacity = data._opacity;
            }

            return h('div', { className: cls, style: grpStyle },
                h(Handle, { type: 'target', position: Position.Left, style: { background: colors.header, width: 6, height: 6 } }),
                h(Handle, { type: 'source', position: Position.Right, style: { background: colors.header, width: 6, height: 6 } }),
                h('div', { className: 'dbrel-rf-grouped-header', style: { background: colors.header } }, grpHeaderChildren),
                h('div', { className: 'dbrel-rf-grouped-body' }, bodyLines)
            );
        }

        var nodeTypes = {
            rowCard: RowCardNode,
            groupedCard: GroupedCardNode
        };

        // Main flow component
        function FlowWrapper() {
            var useState = React.useState;
            var useCallback = React.useCallback;
            var useRef = React.useRef;
            var useEffect = React.useEffect;
            var useMemo = React.useMemo;

            var ReactFlowComponent = XYFlow.ReactFlow || XYFlow.default;
            var ReactFlowProvider = XYFlow.ReactFlowProvider;
            var MiniMap = XYFlow.MiniMap;
            var Background = XYFlow.Background;
            var useReactFlow = XYFlow.useReactFlow;

            var nodesState = useState(currentNodes);
            var nodes = nodesState[0];
            var setNodes = nodesState[1];
            var edgesState = useState(currentEdges);
            var edges = edgesState[0];
            var setEdges = edgesState[1];
            var focusState = useState(null);
            var localFocusId = focusState[0];
            var setLocalFocusId = focusState[1];

            // Expose rerender function to outer scope
            useEffect(function() {
                rerenderFn = function(newNodes, newEdges, newFocusId) {
                    if (newNodes) setNodes(newNodes);
                    if (newEdges) setEdges(newEdges);
                    if (newFocusId !== undefined) setLocalFocusId(newFocusId);
                };
                return function() { rerenderFn = null; };
            }, []);

            // Apply focus highlights with distance-based graduated opacity
            var displayNodes = useMemo(function() {
                if (!localFocusId) {
                    return nodes.map(function(n) {
                        return Object.assign({}, n, {
                            data: Object.assign({}, n.data, { _focused: false, _dimmed: false, _connHighlight: false, _opacity: 1 })
                        });
                    });
                }
                var distances = DbRel.computeNodeDistances(localFocusId);
                return nodes.map(function(n) {
                    var dist = distances[n.id];
                    var opacity = DbRel.distanceToOpacity(dist);
                    return Object.assign({}, n, {
                        data: Object.assign({}, n.data, {
                            _focused: n.id === localFocusId,
                            _dimmed: opacity < 0.15,
                            _connHighlight: dist !== undefined && dist <= 1 && n.id !== localFocusId,
                            _opacity: opacity
                        })
                    });
                });
            }, [nodes, edges, localFocusId]);

            var displayEdges = useMemo(function() {
                if (!localFocusId) {
                    return edges.map(function(e) { return Object.assign({}, e, { className: '', style: e.style }); });
                }
                var distances = DbRel.computeNodeDistances(localFocusId);
                return edges.map(function(e) {
                    var sDist = distances[e.source] !== undefined ? distances[e.source] : Infinity;
                    var tDist = distances[e.target] !== undefined ? distances[e.target] : Infinity;
                    var edgeOpacity = DbRel.distanceToOpacity(Math.max(sDist, tDist));
                    var isDirectlyConnected = e.source === localFocusId || e.target === localFocusId;
                    var updatedStyle = Object.assign({}, e.style || {}, { opacity: edgeOpacity });
                    return Object.assign({}, e, {
                        className: isDirectlyConnected ? 'highlighted' : '',
                        style: updatedStyle
                    });
                });
            }, [edges, localFocusId]);

            var onNodeClick = useCallback(function(evt, node) {
                setLocalFocusId(function(prev) {
                    var val = prev === node.id ? null : node.id;
                    focusedNodeId = val;
                    return val;
                });
            }, []);

            var onNodeDoubleClick = useCallback(function(evt, node) {
                var d = node.data;
                DbRel.showRowModal(d.tableKey, d.rowIndex !== undefined ? d.rowIndex : 0);
            }, []);

            var onPaneClick = useCallback(function() {
                setLocalFocusId(null);
                focusedNodeId = null;
            }, []);

            var onEdgeMouseEnter = useCallback(function(evt, edge) {
                var rd = edge.data;
                if (rd && rd.relData) {
                    var html = DbRel.getLinkTooltipHtml(rd.relData);
                    DbRel.showTooltip(html, evt.clientX + 12, evt.clientY + 12);
                }
            }, []);

            var onEdgeMouseLeave = useCallback(function() {
                DbRel.hideTooltip();
            }, []);

            var onInit = useCallback(function(instance) {
                reactFlowInstance = instance;
                setTimeout(function() {
                    if (instance) instance.fitView({ padding: 0.1, duration: 300 });
                }, 100);
            }, []);

            var onMoveEnd = useCallback(function(evt, viewport) {
                if (viewport) {
                    zoomLevel = Math.round(viewport.zoom * 100);
                    DbRel.setZoomSlider(zoomLevel);
                }
            }, []);

            function InnerFlow() {
                return h(ReactFlowComponent, {
                    nodes: displayNodes,
                    edges: displayEdges,
                    nodeTypes: nodeTypes,
                    onNodeClick: onNodeClick,
                    onNodeDoubleClick: onNodeDoubleClick,
                    onPaneClick: onPaneClick,
                    onEdgeMouseEnter: onEdgeMouseEnter,
                    onEdgeMouseLeave: onEdgeMouseLeave,
                    onInit: onInit,
                    onMoveEnd: onMoveEnd,
                    fitView: true,
                    fitViewOptions: { padding: 0.1 },
                    minZoom: 0.05,
                    maxZoom: 3,
                    defaultEdgeOptions: { type: 'smoothstep' },
                    proOptions: { hideAttribution: true }
                },
                    h(MiniMap, {
                        style: { border: '1px solid #dee2e6', borderRadius: 4 },
                        nodeColor: function(n) {
                            return n.data && n.data.colors ? n.data.colors.header : '#888';
                        },
                        maskColor: 'rgba(0,0,0,0.08)'
                    }),
                    h(Background, { color: '#e9ecef', gap: 20, size: 1 })
                );
            }

            return h('div', { className: 'dbrel-rf-wrapper' },
                h(ReactFlowProvider, null, h(InnerFlow, null))
            );
        }

        // Render
        if (!rootEl) {
            var wrapper = document.createElement('div');
            wrapper.style.cssText = 'width:100%;height:100%;';
            containerEl.appendChild(wrapper);
            rootEl = deps.ReactDOM.createRoot(wrapper);
        }

        rootEl.render(h(FlowWrapper, null));
    }

    /* ====================================================================
     * REGISTER RENDERER
     * ==================================================================== */

    DbRel.registerRenderer('xyflow', {
        init: function(el) {
            containerEl = el;
            containerEl.style.position = 'relative';
            containerEl.style.overflow = 'hidden';
            injectStyles();
            showLoading();
        },

        render: function() {
            loadDeps().then(function() {
                hideLoading();
                buildAndRender();
            }).catch(function(err) {
                hideLoading();
                if (containerEl) {
                    containerEl.innerHTML = '<div style="text-align:center;padding:40px;color:#dc3545;">Failed to load React Flow: ' + escHtml(err.message) + '</div>';
                }
            });
        },

        doLayout: function() {
            if (!DbRel.data || !deps) return;
            nodeCount = 0;
            linkCount = 0;
            DbRel.resetTableColors();
            var result;
            if (DbRel.displayMode === 'grouped') {
                result = buildGroupedNodesEdges();
            } else {
                result = buildSeparateNodesEdges();
            }
            currentNodes = applyLayoutToNodes(result.nodes);
            currentEdges = result.edges;
            if (rerenderFn) {
                rerenderFn(currentNodes, currentEdges);
            }
            setTimeout(function() {
                if (reactFlowInstance) reactFlowInstance.fitView({ padding: 0.1, duration: 300 });
            }, 100);
        },

        setZoom: function(pct) {
            if (!reactFlowInstance) return;
            zoomLevel = pct;
            reactFlowInstance.zoomTo(pct / 100, { duration: 200 });
            DbRel.setZoomSlider(pct);
        },

        getZoom: function() {
            return zoomLevel;
        },

        fitToScreen: function() {
            if (!reactFlowInstance) return;
            reactFlowInstance.fitView({ padding: 0.1, duration: 300 });
        },

        applyFilters: function(dbF, typeF) {
            if (!currentNodes.length) return;
            var filteredNodes = currentNodes.map(function(n) {
                var db = n.data.dbName;
                var hidden = dbF[db] === false;
                return Object.assign({}, n, { hidden: hidden });
            });
            var filteredEdges = currentEdges.map(function(e) {
                var rd = e.data;
                if (!rd) return e;
                var typeVisible = typeF[rd.relType] !== false;
                var srcDb = rd.relData ? rd.relData.source.split('.')[0] : '';
                var tgtDb = rd.relData ? rd.relData.target.split('.')[0] : '';
                var dbVisible = dbF[srcDb] !== false && dbF[tgtDb] !== false;
                return Object.assign({}, e, { hidden: !typeVisible || !dbVisible });
            });
            if (rerenderFn) {
                rerenderFn(filteredNodes, filteredEdges);
            }
        },

        focusNode: function(nodeId) {
            focusedNodeId = nodeId;
            if (rerenderFn) {
                rerenderFn(null, null, nodeId);
            }
            // Center on focused node
            if (reactFlowInstance) {
                var node = currentNodes.find(function(n) { return n.id === nodeId; });
                if (node) {
                    reactFlowInstance.setCenter(
                        node.position.x + (node.data.nodeWidth || 180) / 2,
                        node.position.y + (node.data.nodeHeight || 60) / 2,
                        { zoom: 1, duration: 500 }
                    );
                }
            }
        },

        unfocusNode: function() {
            focusedNodeId = null;
            if (rerenderFn) {
                rerenderFn(null, null, null);
            }
        },

        centerOnTable: function(tableKey) {
            if (!reactFlowInstance) return;
            var targetId = DbRel.displayMode === 'grouped' ? tableKey : tableKey + ':0';
            var node = currentNodes.find(function(n) { return n.id === targetId; });
            if (node) {
                reactFlowInstance.setCenter(
                    node.position.x + (node.data.nodeWidth || 180) / 2,
                    node.position.y + (node.data.nodeHeight || 60) / 2,
                    { zoom: 1, duration: 500 }
                );
            }
        },

        getStats: function() {
            return { nodes: nodeCount, links: linkCount };
        },

        resize: function() {
            // React Flow handles its own resize
        },

        highlightTable: function(tk) {
            if (!rerenderFn || !currentNodes.length) return;
            var activeIds = {};
            currentNodes.forEach(function(n) {
                if (n.data.tableKey === tk) activeIds[n.id] = true;
            });
            currentEdges.forEach(function(e) {
                if (activeIds[e.source] || activeIds[e.target]) {
                    activeIds[e.source] = true;
                    activeIds[e.target] = true;
                }
            });
            var hlNodes = currentNodes.map(function(n) {
                var active = !!activeIds[n.id];
                return Object.assign({}, n, {
                    data: Object.assign({}, n.data, { _dimmed: !active, _connHighlight: active && !n.data._focused })
                });
            });
            var hlEdges = currentEdges.map(function(e) {
                var active = activeIds[e.source] && activeIds[e.target];
                return Object.assign({}, e, { className: active ? 'highlighted' : 'dimmed' });
            });
            rerenderFn(hlNodes, hlEdges);
        },

        clearHighlightTable: function() {
            if (!rerenderFn || !currentNodes.length) return;
            var hlNodes = currentNodes.map(function(n) {
                return Object.assign({}, n, {
                    data: Object.assign({}, n.data, { _dimmed: false, _connHighlight: false })
                });
            });
            var hlEdges = currentEdges.map(function(e) {
                return Object.assign({}, e, { className: '' });
            });
            rerenderFn(hlNodes, hlEdges);
        },

        destroy: function() {
            if (rootEl) {
                rootEl.unmount();
                rootEl = null;
            }
            if (containerEl) containerEl.innerHTML = '';
            containerEl = null;
            focusedNodeId = null;
            reactFlowInstance = null;
            rerenderFn = null;
            currentNodes = [];
            currentEdges = [];
            nodeCount = 0;
            linkCount = 0;
            zoomLevel = 100;
        }
    });

})();
