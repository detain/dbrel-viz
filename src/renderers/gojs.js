/**
 * Database Relationships - GoJS Renderer
 * Leverages GoJS node templates, itemArrays, and built-in layout engines
 * for an ER-diagram style visualization. Registers with DbRel shared shell.
 * @author Joe Huss <detain@interserver.net>
 * @copyright 2025
 */
(function() {
    'use strict';

    var $ = null;  // initialized lazily in initDiagram()
    var myDiagram = null;
    var containerEl = null;
    var zoomLevel = 100;
    var focusedNodeKey = null;

    // ========================================================================
    // DIAGRAM INITIALIZATION
    // ========================================================================

    function initDiagram() {
        if (!containerEl) return;
        if (typeof go === 'undefined') return;
        $ = go.GraphObject.make;
        containerEl.innerHTML = '';

        // Create a div for GoJS inside the container
        var div = document.createElement('div');
        div.id = 'dbrel-gojs-div';
        div.style.width = '100%';
        div.style.height = '100%';
        containerEl.appendChild(div);

        myDiagram = $(go.Diagram, div.id, {
            'undoManager.isEnabled': true,
            'animationManager.isEnabled': true,
            'animationManager.duration': 600,
            'grid.visible': true,
            'grid.gridCellSize': new go.Size(20, 20),
            'toolManager.hoverDelay': 200,
            'toolManager.toolTipDuration': 15000,
            'clickCreatingTool.isEnabled': false,
            'linkingTool.isEnabled': false,
            'relinkingTool.isEnabled': false,
            allowDrop: false,
            allowCopy: false,
            initialAutoScale: go.AutoScale.Uniform,
            initialContentAlignment: go.Spot.Center,
            padding: new go.Margin(20),
            'draggingTool.isGridSnapEnabled': false,
            scrollMode: go.ScrollMode.Infinite,
            maxSelectionCount: 1
        });

        // Grid
        myDiagram.grid =
            $(go.Panel, 'Grid',
                { gridCellSize: new go.Size(20, 20) },
                $(go.Shape, 'LineH', { stroke: 'rgba(0,0,0,0.04)', strokeWidth: 0.5 }),
                $(go.Shape, 'LineV', { stroke: 'rgba(0,0,0,0.04)', strokeWidth: 0.5 })
            );

        // ====================================================================
        // Separate mode template: colored header + itemArray rows
        // ====================================================================
        var separateTemplate =
            $(go.Node, 'Auto',
                {
                    selectionAdorned: true,
                    resizable: false,
                    movable: true,
                    cursor: 'pointer',
                    toolTip: buildNodeTooltip(),
                    click: function(e, node) { onNodeClick(e, node); },
                    doubleClick: function(e, node) { onNodeDblClick(e, node); },
                    mouseEnter: function(e, node) { onNodeHoverEnter(e, node); },
                    mouseLeave: function(e, node) { onNodeHoverLeave(e, node); }
                },
                new go.Binding('location', 'loc', go.Point.parse).makeTwoWay(go.Point.stringify),
                // Outer shape
                $(go.Shape, 'RoundedRectangle',
                    {
                        fill: '#ffffff',
                        stroke: '#dee2e6',
                        strokeWidth: 1,
                        parameter1: 4,
                        portId: '',
                        fromSpot: go.Spot.AllSides,
                        toSpot: go.Spot.AllSides,
                        fromLinkable: false,
                        toLinkable: false
                    },
                    new go.Binding('fill', 'bgColor'),
                    new go.Binding('stroke', 'borderColor')
                ),
                $(go.Panel, 'Vertical',
                    { margin: 0, stretch: go.Stretch.Horizontal },
                    // Header bar
                    $(go.Panel, 'Auto',
                        { stretch: go.Stretch.Horizontal, height: DbRel.HDR_H },
                        $(go.Shape, 'Rectangle',
                            { fill: '#007bff', stroke: null },
                            new go.Binding('fill', 'headerColor')
                        ),
                        $(go.Panel, 'Horizontal',
                            { stretch: go.Stretch.Horizontal, margin: new go.Margin(0, 0, 0, 0) },
                            $(go.Picture,
                                {
                                    margin: new go.Margin(3, 2, 3, 6),
                                    width: 16, height: 16,
                                    visible: false
                                },
                                new go.Binding('source', 'iconSrc'),
                                new go.Binding('visible', 'iconSrc', function(v) { return !!v; })
                            ),
                            $(go.TextBlock,
                                {
                                    margin: new go.Margin(3, 6, 3, 2),
                                    font: 'bold 10px monospace',
                                    stroke: '#ffffff',
                                    alignment: go.Spot.Left,
                                    overflow: go.TextOverflow.Ellipsis,
                                    maxLines: 1,
                                    maxSize: new go.Size(260, NaN)
                                },
                                new go.Binding('text', 'headerText')
                            ),
                            $(go.TextBlock, '\u2316',
                                {
                                    font: '11px sans-serif',
                                    stroke: '#ffffff',
                                    opacity: 0.7,
                                    cursor: 'pointer',
                                    alignment: go.Spot.Right,
                                    margin: new go.Margin(2, 4, 0, 0),
                                    visible: false,
                                    click: function(e, obj) {
                                        e.handled = true;
                                        var d = obj.part.data;
                                        if (d && d.tableKey !== undefined) {
                                            DbRel.pivotTo(d.tableKey, d.rowIndex);
                                        }
                                    },
                                    mouseEnter: function(e, obj) { obj.opacity = 1; },
                                    mouseLeave: function(e, obj) { obj.opacity = 0.7; }
                                },
                                new go.Binding('visible', 'pivotable')
                            )
                        )
                    ),
                    // Item rows panel
                    $(go.Panel, 'Vertical',
                        {
                            name: 'ROWS',
                            margin: new go.Margin(2, 0, 2, 0),
                            stretch: go.Stretch.Horizontal,
                            defaultAlignment: go.Spot.Left,
                            itemTemplate:
                                $(go.Panel, 'Horizontal',
                                    { margin: new go.Margin(0, 6, 0, 6), height: 14 },
                                    $(go.TextBlock,
                                        {
                                            font: '9.5px monospace',
                                            stroke: '#6c757d',
                                            overflow: go.TextOverflow.Ellipsis,
                                            maxLines: 1,
                                            maxSize: new go.Size(120, NaN)
                                        },
                                        new go.Binding('text', 'field')
                                    ),
                                    $(go.TextBlock,
                                        {
                                            font: '9.5px monospace',
                                            stroke: '#495057',
                                            margin: new go.Margin(0, 0, 0, 4),
                                            overflow: go.TextOverflow.Ellipsis,
                                            maxLines: 1,
                                            maxSize: new go.Size(160, NaN)
                                        },
                                        new go.Binding('text', 'value')
                                    )
                                )
                        },
                        new go.Binding('itemArray', 'fields')
                    )
                )
            );

        // ====================================================================
        // Grouped mode template: table with column headers + data rows
        // ====================================================================
        var groupedTemplate =
            $(go.Node, 'Auto',
                {
                    selectionAdorned: true,
                    resizable: false,
                    movable: true,
                    cursor: 'pointer',
                    toolTip: buildNodeTooltip(),
                    click: function(e, node) { onNodeClick(e, node); },
                    doubleClick: function(e, node) { onNodeDblClick(e, node); },
                    mouseEnter: function(e, node) { onNodeHoverEnter(e, node); },
                    mouseLeave: function(e, node) { onNodeHoverLeave(e, node); }
                },
                new go.Binding('location', 'loc', go.Point.parse).makeTwoWay(go.Point.stringify),
                $(go.Shape, 'RoundedRectangle',
                    {
                        fill: '#ffffff',
                        stroke: '#dee2e6',
                        strokeWidth: 1,
                        parameter1: 4,
                        portId: '',
                        fromSpot: go.Spot.AllSides,
                        toSpot: go.Spot.AllSides
                    },
                    new go.Binding('fill', 'bgColor'),
                    new go.Binding('stroke', 'borderColor')
                ),
                $(go.Panel, 'Vertical',
                    { margin: 0, stretch: go.Stretch.Horizontal },
                    // Header
                    $(go.Panel, 'Auto',
                        { stretch: go.Stretch.Horizontal, height: 24 },
                        $(go.Shape, 'Rectangle',
                            { fill: '#007bff', stroke: null },
                            new go.Binding('fill', 'headerColor')
                        ),
                        $(go.Panel, 'Horizontal',
                            { stretch: go.Stretch.Horizontal },
                            $(go.Picture,
                                {
                                    margin: new go.Margin(4, 2, 4, 8),
                                    width: 16, height: 16,
                                    visible: false
                                },
                                new go.Binding('source', 'iconSrc'),
                                new go.Binding('visible', 'iconSrc', function(v) { return !!v; })
                            ),
                            $(go.TextBlock,
                                {
                                    margin: new go.Margin(4, 8, 4, 2),
                                    font: 'bold 11px monospace',
                                    stroke: '#ffffff',
                                    alignment: go.Spot.Left,
                                    overflow: go.TextOverflow.Ellipsis,
                                    maxLines: 1,
                                    maxSize: new go.Size(380, NaN)
                                },
                                new go.Binding('text', 'headerText')
                            ),
                            $(go.TextBlock, '\u2316',
                                {
                                    font: '11px sans-serif',
                                    stroke: '#ffffff',
                                    opacity: 0.7,
                                    cursor: 'pointer',
                                    alignment: go.Spot.Right,
                                    margin: new go.Margin(2, 4, 0, 0),
                                    visible: false,
                                    click: function(e, obj) {
                                        e.handled = true;
                                        var d = obj.part.data;
                                        if (d && d.tableKey !== undefined) {
                                            DbRel.pivotTo(d.tableKey, d.rowIndex);
                                        }
                                    },
                                    mouseEnter: function(e, obj) { obj.opacity = 1; },
                                    mouseLeave: function(e, obj) { obj.opacity = 0.7; }
                                },
                                new go.Binding('visible', 'pivotable')
                            )
                        )
                    ),
                    // Column header row
                    $(go.Panel, 'Horizontal',
                        {
                            name: 'COL_HEADER',
                            margin: new go.Margin(2, 6, 0, 6),
                            stretch: go.Stretch.Horizontal,
                            defaultAlignment: go.Spot.Left,
                            background: 'rgba(0,0,0,0.03)',
                            itemTemplate:
                                $(go.Panel, 'Auto',
                                    { margin: new go.Margin(0, 2, 0, 0), height: 14 },
                                    $(go.TextBlock,
                                        {
                                            font: 'bold 9px monospace',
                                            stroke: '#6c757d',
                                            overflow: go.TextOverflow.Ellipsis,
                                            maxLines: 1
                                        },
                                        new go.Binding('text', 'text'),
                                        new go.Binding('width', 'w')
                                    )
                                )
                        },
                        new go.Binding('itemArray', 'colHeaders')
                    ),
                    // Separator
                    $(go.Shape, 'LineH',
                        {
                            stretch: go.Stretch.Horizontal,
                            height: 1,
                            stroke: 'rgba(0,0,0,0.1)',
                            margin: new go.Margin(1, 4, 0, 4)
                        }
                    ),
                    // Data rows
                    $(go.Panel, 'Vertical',
                        {
                            name: 'DATA_ROWS',
                            margin: new go.Margin(1, 0, 3, 0),
                            stretch: go.Stretch.Horizontal,
                            defaultAlignment: go.Spot.Left,
                            itemTemplate:
                                $(go.Panel, 'Horizontal',
                                    { margin: new go.Margin(0, 6, 0, 6), height: 13 },
                                    $(go.TextBlock,
                                        {
                                            font: '9px monospace',
                                            stroke: '#495057',
                                            overflow: go.TextOverflow.Ellipsis,
                                            maxLines: 1
                                        },
                                        new go.Binding('text', 'text'),
                                        new go.Binding('width', 'w')
                                    )
                                )
                        },
                        new go.Binding('itemArray', 'dataRows')
                    )
                )
            );

        myDiagram.nodeTemplateMap.add('separate', separateTemplate);
        myDiagram.nodeTemplateMap.add('grouped', groupedTemplate);

        // ====================================================================
        // Link template
        // ====================================================================
        myDiagram.linkTemplate =
            $(go.Link,
                {
                    routing: go.Routing.AvoidsNodes,
                    corner: 8,
                    curve: go.Curve.JumpOver,
                    adjusting: go.LinkAdjusting.End,
                    reshapable: false,
                    relinkableFrom: false,
                    relinkableTo: false,
                    toolTip: buildLinkTooltip(),
                    mouseEnter: function(e, link) { onLinkHoverEnter(e, link); },
                    mouseLeave: function(e, link) { onLinkHoverLeave(e, link); }
                },
                $(go.Shape,
                    {
                        strokeWidth: 1.2,
                        stroke: '#495057'
                    },
                    new go.Binding('stroke', 'color'),
                    new go.Binding('strokeWidth', 'width'),
                    new go.Binding('strokeDashArray', 'dash')
                ),
                $(go.Shape,
                    {
                        toArrow: 'Triangle',
                        fill: null,
                        stroke: '#495057',
                        strokeWidth: 1,
                        scale: 0.9
                    },
                    new go.Binding('stroke', 'color'),
                    new go.Binding('toArrow', 'toArrow')
                ),
                $(go.Shape,
                    {
                        fromArrow: '',
                        fill: null,
                        stroke: '#495057',
                        strokeWidth: 1,
                        scale: 0.9,
                        visible: false
                    },
                    new go.Binding('stroke', 'color'),
                    new go.Binding('fromArrow', 'fromArrow'),
                    new go.Binding('visible', 'fromArrow', function(v) { return !!v; })
                ),
                $(go.Panel, 'Auto',
                    $(go.Shape, 'RoundedRectangle',
                        { fill: 'rgba(255, 255, 255, 0.9)', stroke: null, parameter1: 2 }
                    ),
                    $(go.TextBlock,
                        {
                            margin: new go.Margin(1, 4, 1, 4),
                            font: '8px sans-serif',
                            stroke: '#6c757d',
                            segmentOffset: new go.Point(0, -8)
                        },
                        new go.Binding('text', 'label'),
                        new go.Binding('stroke', 'color')
                    )
                )
            );

        // Background click to unfocus
        myDiagram.addDiagramListener('BackgroundSingleClicked', function() {
            if (focusedNodeKey !== null) {
                unfocusNode();
            }
        });

        // Track scale changes for zoom slider
        myDiagram.addDiagramListener('ViewportBoundsChanged', function() {
            if (myDiagram) {
                zoomLevel = Math.round(myDiagram.scale * 100);
                DbRel.setZoomSlider(zoomLevel);
            }
        });
    }

    // ========================================================================
    // TOOLTIP BUILDERS
    // ========================================================================

    function buildNodeTooltip() {
        return $(go.Adornment, 'Auto',
            $(go.Shape, 'RoundedRectangle',
                { fill: '#fff', stroke: '#dee2e6', strokeWidth: 1, parameter1: 4 }
            ),
            $(go.Panel, 'Vertical',
                { margin: 8 },
                $(go.TextBlock,
                    { font: 'bold 11px sans-serif', stroke: '#dc3545', margin: new go.Margin(0, 0, 4, 0) },
                    new go.Binding('text', '', function(d) {
                        return d.tableName + (d.pkValue ? ' #' + d.pkValue : '');
                    })
                ),
                $(go.TextBlock,
                    { font: '10px sans-serif', stroke: '#6c757d' },
                    new go.Binding('text', '', function(d) {
                        return 'DB: ' + d.dbName + ' | Table: ' + d.tableKey;
                    })
                ),
                $(go.TextBlock,
                    { font: '10px sans-serif', stroke: '#adb5bd', margin: new go.Margin(2, 0, 0, 0) },
                    new go.Binding('text', '', function() {
                        return 'Double-click for full details';
                    })
                )
            )
        );
    }

    function buildLinkTooltip() {
        return $(go.Adornment, 'Auto',
            $(go.Shape, 'RoundedRectangle',
                { fill: '#fff', stroke: '#dee2e6', strokeWidth: 1, parameter1: 4 }
            ),
            $(go.Panel, 'Vertical',
                { margin: 8 },
                $(go.TextBlock,
                    { font: 'bold 11px sans-serif', stroke: '#dc3545', margin: new go.Margin(0, 0, 4, 0) },
                    new go.Binding('text', 'label')
                ),
                $(go.TextBlock,
                    { font: '10px sans-serif', stroke: '#6c757d' },
                    new go.Binding('text', '', function(d) {
                        return d.sourceField + ' \u2192 ' + d.targetField;
                    })
                ),
                $(go.TextBlock,
                    { font: '10px sans-serif', stroke: '#adb5bd', margin: new go.Margin(2, 0, 0, 0) },
                    new go.Binding('text', '', function(d) {
                        return d.relType + ' | ' + d.cardinality;
                    })
                )
            )
        );
    }

    // ========================================================================
    // BUILD GRAPH DATA
    // ========================================================================

    function buildGraph() {
        if (!DbRel.data || !myDiagram) return;
        focusedNodeKey = null;

        var nodeDataArray = [];
        var linkDataArray = [];

        if (DbRel.displayMode === 'grouped') {
            buildGroupedData(nodeDataArray, linkDataArray);
        } else {
            buildSeparateData(nodeDataArray, linkDataArray);
        }

        var model = new go.GraphLinksModel(nodeDataArray, linkDataArray);
        model.nodeKeyProperty = 'key';
        model.linkKeyProperty = 'key';
        myDiagram.model = model;

        doLayout();

        setTimeout(function() {
            if (!myDiagram) return;
            myDiagram.zoomToFit();
            zoomLevel = Math.round(myDiagram.scale * 100);
            DbRel.setZoomSlider(zoomLevel);
            DbRel.updateSidebar();
        }, 300);
    }

    function buildSeparateData(nodeDataArray, linkDataArray) {
        var tableKeys = Object.keys(DbRel.data.tables);

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);

            tableInfo.rows.forEach(function(row, ri) {
                var nodeKey = tableKey + ':' + ri;
                var header = DbRel.getNodeHeader(tableKey, ri);
                var lines = DbRel.getNodeLines(tableKey, ri);
                var pkCol = DbRel.getPrimaryKey(tableName);
                var pkVal = pkCol && row[pkCol] !== undefined ? row[pkCol] : (ri + 1);

                // Build field items for the itemArray
                var fields = [];
                lines.forEach(function(line) {
                    var colonIdx = line.indexOf(': ');
                    if (colonIdx > -1) {
                        fields.push({
                            field: line.substring(0, colonIdx + 2),
                            value: line.substring(colonIdx + 2)
                        });
                    } else {
                        fields.push({ field: line, value: '' });
                    }
                });

                var _iconData = DbRel.getTableIconInfo(tableName);
                nodeDataArray.push({
                    key: nodeKey,
                    category: 'separate',
                    tableKey: tableKey,
                    dbName: dbName,
                    tableName: tableName,
                    rowIndex: ri,
                    pkValue: pkVal,
                    headerText: header,
                    headerColor: colors.header,
                    bgColor: colors.bg,
                    borderColor: colors.border,
                    fields: fields,
                    rowData: row,
                    isVisible: true,
                    pivotable: !!DbRel.getPivotConfig(tableName),
                    iconSrc: _iconData ? _iconData.src : ''
                });
            });
        });

        // Build links between individual rows
        var linkIdx = 0;
        DbRel.data.relationships.forEach(function(rel) {
            var style = DbRel.LINK_STYLES[rel.type] || DbRel.LINK_STYLES['direct'];
            (rel.matches || []).forEach(function(match) {
                var srcKey = rel.source + ':' + match[0];
                var srcExists = nodeDataArray.some(function(n) { return n.key === srcKey; });
                if (!srcExists) return;
                match[1].forEach(function(tgtRowIdx) {
                    var tgtKey = rel.target + ':' + tgtRowIdx;
                    var tgtExists = nodeDataArray.some(function(n) { return n.key === tgtKey; });
                    if (!tgtExists) return;
                    linkDataArray.push({
                        key: 'L' + (linkIdx++),
                        from: srcKey,
                        to: tgtKey,
                        label: rel.source_field + '\u2192' + rel.target_field,
                        color: style.stroke,
                        width: style.strokeWidth,
                        dash: style.strokeDasharray && style.strokeDasharray !== '0'
                            ? style.strokeDasharray.split(',').map(Number)
                            : null,
                        toArrow: 'Triangle',
                        fromArrow: '',
                        relType: rel.type,
                        relLabel: rel.label,
                        sourceField: rel.source_field,
                        targetField: rel.target_field,
                        cardinality: rel.cardinality,
                        relData: rel
                    });
                });
            });
        });
    }

    function buildGroupedData(nodeDataArray, linkDataArray) {
        var tableKeys = Object.keys(DbRel.data.tables);
        var charWidth = 6.2;

        tableKeys.forEach(function(tableKey) {
            var tableInfo = DbRel.data.tables[tableKey];
            var dbName = tableKey.split('.')[0];
            var tableName = tableKey.split('.')[1];
            var colors = DbRel.getTableColor(tableKey);

            var lines = DbRel.getGroupedLines(tableKey);
            // First line is column headers, second is separator, rest are data
            var colHeaderLine = lines.length > 0 ? lines[0] : '';
            var colHeaders = colHeaderLine.split(' | ').map(function(h) {
                return { text: h.trim(), w: h.length * charWidth + 8 };
            });

            var dataRows = [];
            for (var i = 2; i < lines.length; i++) {
                dataRows.push({ text: lines[i], w: lines[i].length * charWidth + 16 });
            }

            nodeDataArray.push({
                key: tableKey,
                category: 'grouped',
                tableKey: tableKey,
                dbName: dbName,
                tableName: tableName,
                rowIndex: 0,
                headerText: tableName + ' (' + tableInfo.total + ')',
                headerColor: colors.header,
                bgColor: colors.bg,
                borderColor: colors.border,
                colHeaders: colHeaders,
                dataRows: dataRows,
                isVisible: true,
                pivotable: !!DbRel.getPivotConfig(tableName),
                iconSrc: (function() { var ic = DbRel.getTableIconInfo(tableName); return ic ? ic.src : ''; })()
            });
        });

        // One link per relationship (table to table)
        var linkIdx = 0;
        DbRel.data.relationships.forEach(function(rel) {
            var srcExists = nodeDataArray.some(function(n) { return n.key === rel.source; });
            var tgtExists = nodeDataArray.some(function(n) { return n.key === rel.target; });
            if (!srcExists || !tgtExists) return;

            var style = DbRel.LINK_STYLES[rel.type] || DbRel.LINK_STYLES['direct'];
            var targetMany = rel.cardinality && (rel.cardinality.split(':')[1] === 'N' || rel.cardinality.split(':')[1] === 'M');
            var sourceMany = rel.cardinality && (rel.cardinality === 'M:N' || rel.cardinality === 'N:1');

            linkDataArray.push({
                key: 'L' + (linkIdx++),
                from: rel.source,
                to: rel.target,
                label: rel.label,
                color: style.stroke,
                width: style.strokeWidth,
                dash: style.strokeDasharray && style.strokeDasharray !== '0'
                    ? style.strokeDasharray.split(',').map(Number)
                    : null,
                toArrow: targetMany ? 'StretchedDiamond' : 'Triangle',
                fromArrow: sourceMany ? 'BackwardTriangle' : '',
                relType: rel.type,
                relLabel: rel.label,
                sourceField: rel.source_field,
                targetField: rel.target_field,
                cardinality: rel.cardinality,
                relData: rel
            });
        });
    }

    // ========================================================================
    // LAYOUT
    // ========================================================================

    function doLayout() {
        if (!myDiagram) return;

        myDiagram.startTransaction('layout');

        var layout = new go.LayeredDigraphLayout();
        layout.direction = 0; // left to right
        layout.layerSpacing = 50;
        layout.columnSpacing = 12;
        layout.setsPortSpots = false;
        layout.packOption = go.LayeredDigraphPack.All;
        layout.aggressiveOption = go.LayeredDigraphAggressive.More;
        layout.cycleRemoveOption = go.LayeredDigraphCycleRemove.Greedy;
        layout.layeringOption = go.LayeredDigraphLayering.OptimalLinkLength;
        layout.initializeOption = go.LayeredDigraphInit.DepthFirstOut;
        layout.alignOption = go.LayeredDigraphAlign.All;

        myDiagram.layout = layout;
        myDiagram.layoutDiagram(true);

        myDiagram.commitTransaction('layout');
    }

    function doTreeLayout() {
        if (!myDiagram) return;
        myDiagram.startTransaction('treeLayout');

        var layout = new go.TreeLayout();
        layout.angle = 0;
        layout.layerSpacing = 100;
        layout.nodeSpacing = 20;
        layout.arrangement = go.TreeArrangement.Horizontal;
        layout.treeStyle = go.TreeStyle.LastParents;
        layout.alternateAngle = 0;
        layout.alternateLayerSpacing = 60;

        myDiagram.layout = layout;
        myDiagram.layoutDiagram(true);

        myDiagram.commitTransaction('treeLayout');
    }

    // ========================================================================
    // INTERACTION HANDLERS
    // ========================================================================

    function onNodeClick(e, node) {
        var nodeKey = node.data.key;
        if (focusedNodeKey === nodeKey) {
            unfocusNode();
            return;
        }
        focusNode(nodeKey);
    }

    function onNodeDblClick(e, node) {
        var d = node.data;
        if (!d || !d.tableKey || d.rowIndex === undefined || !DbRel.data || !DbRel.data.tables[d.tableKey]) return;
        DbRel.showRowModal(d.tableKey, d.rowIndex);
    }

    function onNodeHoverEnter(e, node) {
        if (focusedNodeKey) return;
        highlightConnected(node.data.key, true);
    }

    function onNodeHoverLeave(e, node) {
        if (focusedNodeKey) return;
        clearAllHighlights();
    }

    function onLinkHoverEnter(e, link) {
        if (focusedNodeKey) return;
        link.isHighlighted = true;
        if (link.fromNode) link.fromNode.isHighlighted = true;
        if (link.toNode) link.toNode.isHighlighted = true;

        // Show tooltip via DbRel
        var rd = link.data;
        if (rd && rd.relData) {
            var pt = e.viewPoint;
            DbRel.showTooltip(DbRel.getLinkTooltipHtml(rd.relData), pt.x, pt.y);
        }
    }

    function onLinkHoverLeave(e, link) {
        DbRel.hideTooltip();
        if (focusedNodeKey) return;
        clearAllHighlights();
    }

    function highlightConnected(nodeKey, highlight) {
        if (!myDiagram) return;
        var node = myDiagram.findNodeForKey(nodeKey);
        if (!node) return;

        node.isHighlighted = highlight;
        node.linksConnected.each(function(link) {
            link.isHighlighted = highlight;
            var other = link.fromNode.data.key === nodeKey ? link.toNode : link.fromNode;
            if (other) other.isHighlighted = highlight;
        });
    }

    function clearAllHighlights() {
        if (!myDiagram) return;
        myDiagram.nodes.each(function(n) { n.isHighlighted = false; });
        myDiagram.links.each(function(l) { l.isHighlighted = false; });
    }

    // ========================================================================
    // FOCUS / UNFOCUS
    // ========================================================================

    function focusNode(nodeKey) {
        if (focusedNodeKey && focusedNodeKey !== nodeKey) {
            unfocusNode();
        }
        focusedNodeKey = nodeKey;

        var focNode = myDiagram.findNodeForKey(nodeKey);
        if (!focNode) return;

        // Distance-based graduated opacity
        var distances = DbRel.computeNodeDistances(nodeKey);

        myDiagram.nodes.each(function(n) {
            var dist = distances[n.data.key];
            var opacity = DbRel.distanceToOpacity(dist);
            n.isHighlighted = dist !== undefined && dist <= 1;
            n.opacity = opacity;
        });

        myDiagram.links.each(function(link) {
            if (!link.fromNode || !link.toNode) return;
            var sDist = distances[link.fromNode.data.key];
            var tDist = distances[link.toNode.data.key];
            var sD = sDist !== undefined ? sDist : Infinity;
            var tD = tDist !== undefined ? tDist : Infinity;
            var edgeDist = Math.max(sD, tD);
            var edgeOpacity = DbRel.distanceToOpacity(edgeDist);
            link.isHighlighted = link.fromNode.data.key === nodeKey || link.toNode.data.key === nodeKey;
            link.opacity = edgeOpacity;
        });

        // Center on the focused node
        myDiagram.commandHandler.scrollToPart(focNode);
    }

    function unfocusNode() {
        focusedNodeKey = null;
        if (!myDiagram) return;
        myDiagram.nodes.each(function(n) {
            n.isHighlighted = false;
            n.opacity = 1.0;
        });
        myDiagram.links.each(function(l) {
            l.isHighlighted = false;
            l.opacity = 1.0;
        });
    }

    // ========================================================================
    // FILTERS
    // ========================================================================

    function applyFilters(dbF, typeF) {
        if (!myDiagram || !DbRel.data) return;

        myDiagram.startTransaction('filter');

        myDiagram.nodes.each(function(node) {
            var d = node.data;
            var dbVisible = dbF[d.dbName] !== false;
            node.visible = dbVisible;
        });

        myDiagram.links.each(function(link) {
            var d = link.data;
            if (!d || !d.relData) { link.visible = true; return; }
            var rd = d.relData;
            var srcDb = rd.source.split('.')[0];
            var tgtDb = rd.target.split('.')[0];
            var typeVis = typeF[d.relType] !== false;
            var dbVis = dbF[srcDb] !== false && dbF[tgtDb] !== false;
            link.visible = typeVis && dbVis;
        });

        myDiagram.commitTransaction('filter');
    }

    // ========================================================================
    // CENTER ON TABLE
    // ========================================================================

    function centerOnTable(tableKey) {
        if (!myDiagram) return;
        var targetNode = null;
        myDiagram.nodes.each(function(n) {
            if (!targetNode && n.data.tableKey === tableKey) targetNode = n;
        });
        if (targetNode) {
            myDiagram.commandHandler.scrollToPart(targetNode);
            myDiagram.select(targetNode);
        }
    }

    // ========================================================================
    // ZOOM
    // ========================================================================

    function setZoom(pct) {
        if (!myDiagram) return;
        zoomLevel = Math.max(5, Math.min(300, pct));
        myDiagram.scale = zoomLevel / 100;
    }

    function fitToScreen() {
        if (!myDiagram) return;
        myDiagram.zoomToFit();
        zoomLevel = Math.round(myDiagram.scale * 100);
        DbRel.setZoomSlider(zoomLevel);
    }

    // ========================================================================
    // RESIZE
    // ========================================================================

    function resizeDiagram() {
        if (myDiagram) myDiagram.requestUpdate();
    }

    // ========================================================================
    // REGISTER RENDERER
    // ========================================================================

    DbRel.registerRenderer('gojs', {
        init: function(el) {
            containerEl = el;
            initDiagram();
        },
        render: function() {
            buildGraph();
        },
        doLayout: function() {
            doLayout();
            setTimeout(function() {
                if (myDiagram) {
                    myDiagram.zoomToFit();
                    zoomLevel = Math.round(myDiagram.scale * 100);
                    DbRel.setZoomSlider(zoomLevel);
                }
            }, 300);
        },
        setZoom: function(pct) { setZoom(pct); },
        getZoom: function() { return zoomLevel; },
        fitToScreen: function() { fitToScreen(); },
        applyFilters: function(dbF, typeF) { applyFilters(dbF, typeF); },
        focusNode: function(nid) { focusNode(nid); },
        unfocusNode: function() { unfocusNode(); },
        centerOnTable: function(tk) { centerOnTable(tk); },
        getStats: function() {
            return {
                nodes: myDiagram ? myDiagram.nodes.count : 0,
                links: myDiagram ? myDiagram.links.count : 0
            };
        },
        resize: function() { resizeDiagram(); },
        highlightTable: function(tk) {
            if (!myDiagram) return;
            var connectedKeys = {};
            myDiagram.nodes.each(function(n) {
                if (n.data.tableKey === tk) connectedKeys[n.data.key] = true;
            });
            myDiagram.links.each(function(l) {
                if (connectedKeys[l.fromNode.data.key] || connectedKeys[l.toNode.data.key]) {
                    connectedKeys[l.fromNode.data.key] = true;
                    connectedKeys[l.toNode.data.key] = true;
                }
            });
            myDiagram.nodes.each(function(n) {
                n.opacity = connectedKeys[n.data.key] ? 1 : 0.15;
            });
            myDiagram.links.each(function(l) {
                l.opacity = (connectedKeys[l.fromNode.data.key] && connectedKeys[l.toNode.data.key]) ? 1 : 0.06;
            });
        },
        clearHighlightTable: function() {
            if (!myDiagram) return;
            myDiagram.nodes.each(function(n) { n.opacity = 1; });
            myDiagram.links.each(function(l) { l.opacity = 1; });
        },
        destroy: function() {
            if (myDiagram) {
                myDiagram.div = null;
                myDiagram = null;
            }
            if (containerEl) containerEl.innerHTML = '';
            containerEl = null;
            focusedNodeKey = null;
            zoomLevel = 100;
        }
    });

})();
