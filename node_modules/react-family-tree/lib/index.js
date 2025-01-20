import React from 'react';
import calcTree from 'relatives-tree';
import Connector from './connector';
export default React.memo(function ReactFamilyTree(props) {
    const data = calcTree(props.nodes, {
        rootId: props.rootId,
        placeholders: props.placeholders,
    });
    const width = props.width / 2;
    const height = props.height / 2;
    return (React.createElement("div", { className: props.className, style: {
            position: 'relative',
            width: data.canvas.width * width,
            height: data.canvas.height * height,
        } },
        data.connectors.map((connector, idx) => (React.createElement(Connector, { key: idx, connector: connector, width: width, height: height }))),
        data.nodes.map(props.renderNode)));
});
