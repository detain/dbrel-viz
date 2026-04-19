/**
 * @detain/dbrel-viz — Database Relationship Visualization Library
 *
 * Main entry point. Exposes the DbRel namespace and renderer registry.
 *
 * Usage in browser (script tags):
 *   <link rel="stylesheet" href="node_modules/@detain/dbrel-viz/src/core/styles.css">
 *   <script src="node_modules/@detain/dbrel-viz/src/core/shell.js"></script>
 *   <script src="node_modules/@detain/dbrel-viz/src/renderers/jointjs.js"></script>
 *   <!-- Other renderers load lazily on demand -->
 *
 * Or via bundler:
 *   import '@detain/dbrel-viz/src/core/shell.js';
 *   import '@detain/dbrel-viz/src/renderers/jointjs.js';
 *
 * Then in your page, once data is loaded (see @detain/dbrel-data-php or
 * @detain/dbrel-data-js for data providers):
 *   DbRel.data = yourData;
 *   DbRel.renderers['jointjs'].render();
 */
module.exports = {
    // Paths for direct use (script tags, express.static, etc.)
    paths: {
        shell: require.resolve('./core/shell.js'),
        styles: require.resolve('./core/styles.css'),
        icons: __dirname + '/icons'
    },
    // List of available renderer keys
    renderers: [
        'jointjs', 'cytoscape', 'sigma', 'visjs', 'd3', 'gojs',
        'forcegraph', 'vivagraph', 'springy', 'g6',
        'c3', 'dcjs', 'nvd3',
        'p5', 'raphael', 'vega',
        'maxgraph', 'reactdiagrams', 'xyflow', 'recharts'
    ],
    // Resolve a renderer's JS file path
    rendererPath: function(key) {
        return __dirname + '/renderers/' + key + '.js';
    },
    // Version
    version: require('../package.json').version
};
