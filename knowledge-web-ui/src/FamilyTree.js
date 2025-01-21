import React, { useState, useRef, useEffect, useCallback } from 'react';
import * as d3 from 'd3';
import TopicDetail from './TopicDetail';

const FamilyTree = ({ data: initialData, updateTreeData }) => {
  const svgRef = useRef();
  const gRef = useRef();
  const treeDataRef = useRef(initialData);
  const [treeData, setTreeData] = useState(initialData);
  const simulation = useRef(null);
  const [detailView, setDetailView] = useState(null);
  const [currentTreeData, setCurrentTreeData] = useState(initialData);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeNode, setActiveNode] = useState(null);
  const [clickedNode, setClickedNode] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [loadingNodes, setLoadingNodes] = useState(false);
  const [latestNodes, setLatestNodes] = useState([]);

  useEffect(() => {
    const handleResize = () => {
      // Re-render the tree
      setTreeData({...treeData});
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [treeData]);

  // Function to add a new node
  const addNode = useCallback((currentData, targetNode, newContent, isLargeNode = false) => {
    if (currentData.name === targetNode.name) {
      const newNode = { name: newContent, children: [], isLargeNode };
      return {
        updatedData: {
          ...currentData,
          children: [...(currentData.children || []), newNode],
        },
        newNode: newNode, // Return the newly added node
      };
    }
    if (currentData.children) {
      const childrenUpdates = currentData.children.map(child =>
        addNode(child, targetNode, newContent, isLargeNode)
      );
      const updatedChildren = childrenUpdates.map(child => child.updatedData);
      const newNode = childrenUpdates.find(child => child.newNode)?.newNode;
      return {
        updatedData: { ...currentData, children: updatedChildren },
        newNode,
      };
    }
    return { updatedData: currentData, newNode: null };
  }, []);

  const focusOnNode = useCallback((newNodes) => {
    const svg = d3.select(svgRef.current);
    const width = svg.node().clientWidth;
    const height = svg.node().clientHeight;
    const margin = { top: 0, right: 0, bottom: 0, left: 0 };
    console.log('SVG Dimensions:', { width, height });
    const root = d3.hierarchy(treeDataRef.current);
    const treeLayout = d3.tree().size([width - margin.left - margin.right, height - margin.top - margin.bottom]);
    treeLayout(root);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    newNodes.forEach(nodeName => {
      const nodeData = root.descendants().find(d => d.data.name === nodeName);
      if (nodeData) {
        const nodeX = nodeData.x + margin.left;
        const nodeY = nodeData.y + margin.top;
        console.log(`Node ${nodeName} Coordinates:`, { nodeX, nodeY });
        x0 = Math.min(x0, nodeX);
        x1 = Math.max(x1, nodeX);
        y0 = Math.min(y0, nodeY);
        y1 = Math.max(y1, nodeY);
      }
    });
    // If no new nodes are found, return early
    if (x0 === Infinity || x1 === -Infinity || y0 === Infinity || y1 === -Infinity) return;
    const bboxWidth = x1 - x0;
    const bboxHeight = y1 - y0;
    console.log('Bounding Box Dimensions:', { bboxWidth, bboxHeight });

    const padding = 50;
    const svgWidth = width - margin.left - margin.right;
    const svgHeight = height - margin.top - margin.bottom;
    // Use a higher scale to zoom in on the new nodes
    const scale = Math.min(
      svgWidth / bboxWidth,
      svgHeight / bboxHeight
    ) * 1; // Adjust the scale multiplier as needed
    const translateX = (svgWidth / 2) - (x0 + bboxWidth / 2) * scale;
    const translateY = (svgHeight / 2) - (y0 + bboxHeight / 2) * scale;
    svg.transition().duration(750).call(
      d3.zoom().transform,
      d3.zoomIdentity.translate(translateX, translateY).scale(scale)
    );
  }, []);

  function parseStringToArray(str) {
    // Remove the square brackets, single quotes, and double quotes
    const cleanedStr = str.replace(/[\[\]'" ]+/g, ' ').trim();
   
    // Split the string by commas
    const array = cleanedStr.split(',').map(item => item.trim());
   
    return array;
  }

  const handleSingleClick = useCallback((nodeData) => {
    setIsGenerating(true);
    setLoadingNodes(true);
    setClickedNode(nodeData.name);
    setActiveNode(nodeData.name);
    console.log("Node clicked:", nodeData);
    
    fetch('http://localhost:9000/node-click', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: nodeData.name }),
    })
    .then(response => response.json())
    .then(data => {
      console.log("Response data:", data);
      const newNodeArray = parseStringToArray(data["name"]);
      let updatedData = treeDataRef.current;
      let newlyAddedNodes = [];
      
      newNodeArray.forEach(newNodeName => {
        const result = addNode(updatedData, nodeData, newNodeName);
        updatedData = result.updatedData;
        if (result.newNode) {
          newlyAddedNodes.push(result.newNode.name);
        }
      });
      
      treeDataRef.current = updatedData;
      setTreeData(updatedData);
      updateTreeData(updatedData);
      setLatestNodes(newlyAddedNodes); // Update latest nodes
    })
    .catch((error) => {
      console.error('Error:', error);
    })
    .finally(() => {
      setIsGenerating(false);
      setLoadingNodes(false);
      setClickedNode(null);
      setActiveNode(null);
    });
  }, [addNode, updateTreeData, focusOnNode]);

  const handleDoubleClick = useCallback((nodeData) => {
    setLoadingDetail(true);
    setClickedNode(nodeData.name);
    console.log("Node double clicked:", nodeData);
    
    fetch('http://localhost:9000/node-detail', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: nodeData.name }),
    })
    .then(response => response.json())
    .then(data => {
      if (!data.content) {
        throw new Error('No content received');
      }
      setDetailView({
        topic: nodeData.name,
        content: {
          title: data.title || `About ${nodeData.name}`,
          content: data.content
        },
        treeData: currentTreeData
      });
    })
    .catch((error) => {
      console.error('Error:', error);
      setDetailView({
        topic: nodeData.name,
        content: {
          title: `About ${nodeData.name}`,
          content: "Failed to load content. Please try again."
        },
        treeData: currentTreeData
      });
    })
    .finally(() => {
      setLoadingDetail(false);
      setClickedNode(null);
    });
  }, [currentTreeData]);

  // Reset tree to initial data
  const resetTree = async () => {
    try {
      const response = await fetch("http://localhost:9000/reset-tree", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("Tree has been reset on backend:", result);
     
      // Update the treeDataRef and the state with the reset data from the backend
      const initialData = result.data;
      treeDataRef.current = initialData;
      setTreeData(initialData);
    } catch (error) {
      console.error("Error resetting tree data:", error);
    }
  };

  // Add this function to fit all nodes on screen
  const fitToScreen = useCallback(() => {
    const svg = d3.select(svgRef.current);
    const g = gRef.current;
    const bounds = g.node().getBBox();
    
    const width = svg.node().clientWidth;
    const height = svg.node().clientHeight;
    
    const padding = 40;
    const scale = Math.min(
      width / (bounds.width + padding * 2),
      height / (bounds.height + padding * 2)
    );
    
    const translateX = (width - bounds.width * scale) / 2 - bounds.x * scale;
    const translateY = (height - bounds.height * scale) / 2 - bounds.y * scale;
    
    svg.transition()
      .duration(750)
      .call(
        d3.zoom().transform,
        d3.zoomIdentity
          .translate(translateX, translateY)
          .scale(scale)
      );
  }, []);

  // Add this helper function to determine node size
  const getNodeSize = (nodeName) => {
    // Base size calculation on word count and length
    const words = nodeName.split(' ');
    const wordCount = words.length;
    const avgWordLength = nodeName.length / wordCount;
    
    // Broad topics tend to be shorter, specific ones longer
    const isDetailedTopic = avgWordLength > 8 || wordCount >= 4;
    const isVeryBroadTopic = wordCount === 1 && nodeName.length < 8;
    
    if (isDetailedTopic) {
      return { width: 180, height: 90 }; // Larger for detailed topics
    } else if (isVeryBroadTopic) {
      return { width: 100, height: 60 }; // Smaller for broad topics
    } else {
      return { width: 140, height: 70 }; // Default size
    }
  };

  // Update the wrap function for better text centering
  const wrap = (text, width, isLargeNode) => {
    text.each(function() {
      const text = d3.select(this);
      const words = text.text().split(/\s+/);
      const lineHeight = isLargeNode ? 1.3 : 1.2;
      
      // Clear any existing text/tspans first
      text.text(null);
      
      let lines = [];
      let line = [];
      let testText = text.append("tspan").attr("visibility", "hidden");

      // Calculate lines first
      words.forEach(word => {
        line.push(word);
        testText.text(line.join(" "));
        
        if (testText.node().getComputedTextLength() > width && line.length > 1) {
          line.pop();
          lines.push(line.join(" "));
          line = [word];
        }
      });
      if (line.length > 0) {
        lines.push(line.join(" "));
      }

      // Remove test element
      testText.remove();

      // Calculate total height and starting position
      const totalHeight = (lines.length - 1) * lineHeight;
      const startY = -(totalHeight * 0.5);

      // Add lines with proper positioning
      lines.forEach((lineText, i) => {
        text.append("tspan")
          .attr("x", 0)
          .attr("y", 0)
          .attr("dy", `${startY + (i * lineHeight)}em`)
          .text(lineText);
      });
    });
  };

  // Convert tree data to flat array of nodes with positions
  const flattenNodes = useCallback((data, parent = null, depth = 0, x = 0) => {
    const nodes = [];
    const node = {
      id: data.name,
      name: data.name,
      isLargeNode: data.isLargeNode,
      parent: parent,
      depth: depth,
      x: x + (Math.random() - 0.5) * 300, // Add some random scatter
      y: depth * 200 + (Math.random() - 0.5) * 100
    };
    nodes.push(node);

    if (data.children) {
      data.children.forEach((child, i) => {
        const childNodes = flattenNodes(
          child, 
          node.id, 
          depth + 1,
          x + (i - (data.children.length - 1) / 2) * 200
        );
        nodes.push(...childNodes);
      });
    }
    return nodes;
  }, []);

  // Create links between related nodes
  const createLinks = useCallback((nodes) => {
    const links = [];
    nodes.forEach(node => {
      if (node.parent) {
        links.push({
          source: nodes.find(n => n.id === node.parent),
          target: node
        });
      }
    });
    return links;
  }, []);

  // Add drag functions
  const dragstarted = useCallback((event) => {
    if (!event.active) simulation.current.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }, []);

  const dragged = useCallback((event) => {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }, []);

  const dragended = useCallback((event) => {
    if (!event.active) simulation.current.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }, []);

  // Add this function to determine if a node is the root node
  const isRootNode = (nodeName) => {
    return nodeName === "All Topics";
  };

  // Replace the D3 tree rendering with force-directed layout
  useEffect(() => {
    const container = svgRef.current.parentElement;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const svg = d3.select(svgRef.current)
      .attr("width", "100%")
      .attr("height", "100%")
      .attr("viewBox", `0 0 ${width} ${height}`);

    svg.selectAll('*').remove();

    const g = svg.append("g");
    gRef.current = g;

    // Setup zoom behavior
    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom)
      .on("dblclick.zoom", null);

    // Create nodes and links with performance optimizations
    const flatNodes = flattenNodes(treeDataRef.current);
    const nodeLinks = createLinks(flatNodes);

    // Setup force simulation with reduced strength and iterations
    simulation.current = d3.forceSimulation(flatNodes)
      .force("link", d3.forceLink(nodeLinks)
        .id(d => d.id)
        .distance(d => (isRootNode(d.source.name) || isRootNode(d.target.name)) ? 250 : 200)
        .strength(0.3))
      .force("charge", d3.forceManyBody()
        .strength(d => isRootNode(d.name) ? -800 : -500)
        .distanceMax(300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(d => isRootNode(d.name) ? 120 : 80))
      .alphaDecay(0.1)
      .alphaMin(0.001)
      .velocityDecay(0.4);

    // Draw links
    const links = g.selectAll(".link")
      .data(nodeLinks)
      .enter()
      .append("path")
      .attr("class", "link")
      .attr("stroke", "#CBD5E0") // Light gray for links
      .attr("stroke-width", 1.5)
      .attr("fill", "none");

    // Draw nodes
    const node = g.selectAll(".node")
      .data(flatNodes)
      .enter()
      .append("g")
      .attr("class", "node")
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    // Create curved rectangles for nodes
    node.each(function(d) {
      const nodeGroup = d3.select(this);
      const isLargeNode = d.isLargeNode;
      const isRoot = isRootNode(d.name);
      
      // Color palette remains the same
      const smallNodeColors = [
        '#E3F2E9', // lighter sage
        '#FFF0E8', // lighter peach
        '#FCE8EB', // lighter rose
        '#E8F1F8', // lighter blue
        '#EEF3F8', // lighter gray-blue
        '#E8F2EB', // lighter mint
        '#FFF1EC', // lighter blush
        '#F3E8F8', // lighter lavender
        '#E8F6ED', // lighter mint green
        '#FFF0E6'  // lighter sand
      ];

      const largeNodeColors = [
        '#D4E9DD', // light sage
        '#FFE4D6', // light peach
        '#FCDCE2', // light rose
        '#DBE8F3', // light blue
        '#E1EAF3', // light gray-blue
        '#DBE9E0', // light mint
        '#FFE6DE', // light blush
        '#E8DBF3', // light lavender
        '#DBF0E3', // light mint green
        '#FFE6D6'  // light sand
      ];

      const colorIndex = d.name.length % 10;
      const fillColor = isLargeNode ? largeNodeColors[colorIndex] : smallNodeColors[colorIndex];

      // Get dynamic size based on topic
      const nodeSize = getNodeSize(d.name);
      const width = isRoot ? 250 : (isLargeNode ? 300 : nodeSize.width);
      const height = isRoot ? 160 : (isLargeNode ? 200 : nodeSize.height);

      // Create the node rectangle with dynamic sizing
      const rect = nodeGroup.append("rect")
        .attr("width", width)
        .attr("height", height)
        .attr("x", -width / 2)
        .attr("y", -height / 2)
        .attr("rx", Math.min(width, height) * 0.2)
        .attr("ry", Math.min(width, height) * 0.2)
        .attr("fill", isRoot ? "#E1EAF3" : fillColor) // Special color for root
        .attr("stroke", isRoot ? "#CBD5E0" : "none") // Add border for root
        .attr("stroke-width", isRoot ? 2 : 0)
        .style("filter", `drop-shadow(0px 2px ${isRoot ? 6 : 3}px rgba(0,0,0,${isRoot ? 0.15 : 0.1}))`)
        .style("transition", "all 0.3s ease");

      // Add hover and click effects with more noticeable feedback
      nodeGroup
        .style("cursor", "pointer")
        .on("mouseenter", function() {
          // Enhance node hover effect
          rect.transition()
            .duration(300)
            .attr("transform", "scale(1.08)")
            .attr("filter", `drop-shadow(0px 8px 16px rgba(0,0,0,0.2))`);

          // Add subtle animation to connected links
          const nodeId = d.id;
          g.selectAll(".link")
            .filter(link => link.source.id === nodeId || link.target.id === nodeId)
            .transition()
            .duration(300)
            .attr("stroke", "#4A5568")
            .attr("stroke-width", 2.5)
            .attr("stroke-dasharray", "8,4")
            .style("animation", "dash 1s linear infinite");

          // Add subtle wiggle animation to connected nodes
          g.selectAll(".node")
            .filter(node => {
              const connectedLinks = nodeLinks.filter(link => 
                (link.source.id === nodeId && link.target.id === node.id) ||
                (link.target.id === nodeId && link.source.id === node.id)
              );
              return connectedLinks.length > 0;
            })
            .transition()
            .duration(300)
            .attr("transform", function(d) {
              const baseTransform = `translate(${d.x},${d.y})`;
              return `${baseTransform} rotate(${Math.random() * 2 - 1})`;
            });
        })
        .on("mouseleave", function() {
          // Reset node effect
          rect.transition()
            .duration(300)
            .attr("transform", "scale(1)")
            .attr("filter", `drop-shadow(0px 2px ${isRoot ? 6 : 3}px rgba(0,0,0,${isRoot ? 0.15 : 0.1}))`);

          // Reset link effects
          g.selectAll(".link")
            .transition()
            .duration(300)
            .attr("stroke", "#CBD5E0")
            .attr("stroke-width", 1.5)
            .attr("stroke-dasharray", null)
            .style("animation", null);

          // Reset connected nodes
          g.selectAll(".node")
            .transition()
            .duration(300)
            .attr("transform", d => `translate(${d.x},${d.y})`);
        });

      // Enhanced click feedback
      const originalFill = isRoot ? "#E1EAF3" : fillColor;
      nodeGroup.on("mousedown", function() {
        rect.transition()
          .duration(100)
          .attr("transform", "scale(0.95)") // Add slight shrink effect
          .attr("fill", "#CBD5E0") // More noticeable grey color
          .transition()
          .duration(400)
          .attr("transform", "scale(1)")
          .attr("fill", originalFill);

        // Add ripple effect
        const ripple = nodeGroup.append("circle")
          .attr("r", 10)
          .attr("fill", "rgba(255,255,255,0.8)")
          .attr("opacity", 1);

        ripple.transition()
          .duration(600)
          .attr("r", Math.max(width, height))
          .attr("opacity", 0)
          .remove();
      });

      // Update text sizing with larger font for root
      const text = nodeGroup.append("text")
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("dy", "0.35em")
        .style("font-size", isRoot ? "18px" : (isLargeNode ? "14px" : "13px"))
        .style("fill", "#2C3E50")
        .style("font-weight", isRoot ? "700" : "600")
        .style("font-family", "'Segoe UI', system-ui, -apple-system, sans-serif")
        .style("letter-spacing", "0.2px")
        .style("text-shadow", "0 1px 1px rgba(255,255,255,0.5)")
        .text(d.name);

      wrap(text, isRoot ? 330 : (isLargeNode ? 280 : (width * 0.8)), isLargeNode);

      // Add loading indicator
      const loadingIndicator = nodeGroup.append("g")
        .attr("class", "loading-indicator")
        .style("opacity", 0);

      loadingIndicator.append("circle")
        .attr("r", 12)
        .attr("fill", "rgba(255,255,255,0.9)")
        .attr("stroke", "#4A5568")
        .attr("stroke-width", 2);

      loadingIndicator.append("path")
        .attr("d", "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z")
        .attr("fill", "#4A5568")
        .attr("transform", "scale(0.5)");

      // Show loading indicator when generating
      if (isGenerating && d.name === activeNode) {
        loadingIndicator
          .style("opacity", 1)
          .style("animation", "spin 1s linear infinite");
      } else {
        loadingIndicator
          .style("opacity", 0)
          .style("animation", "none");
      }

      // Add glow filter definitions
      const defs = svg.append("defs");
      
      // Click glow filter (existing)
      defs.append("filter")
        .attr("id", "click-glow")
        .append("feDropShadow")
        .attr("dx", "0")
        .attr("dy", "0")
        .attr("stdDeviation", "3")
        .attr("flood-color", "#4A5568")
        .attr("flood-opacity", "0.5");

      // New nodes glow filter
      defs.append("filter")
        .attr("id", "new-node-glow")
        .append("feGaussianBlur")
        .attr("stdDeviation", "3")
        .attr("result", "coloredBlur");

      const newNodeFilter = defs.append("filter")
        .attr("id", "new-node-glow")
        .attr("x", "-50%")
        .attr("y", "-50%")
        .attr("width", "200%")
        .attr("height", "200%");

      newNodeFilter.append("feGaussianBlur")
        .attr("in", "SourceAlpha")
        .attr("stdDeviation", "8")
        .attr("result", "blur");

      newNodeFilter.append("feFlood")
        .attr("flood-color", "#FFD700")
        .attr("flood-opacity", "0.6")
        .attr("result", "color");

      newNodeFilter.append("feComposite")
        .attr("in", "color")
        .attr("in2", "blur")
        .attr("operator", "in")
        .attr("result", "shadow");

      newNodeFilter.append("feComposite")
        .attr("in", "SourceGraphic")
        .attr("in2", "shadow")
        .attr("operator", "over");

      // Apply appropriate filter based on node state
      const isClicked = d.name === clickedNode;
      const isNewNode = latestNodes.includes(d.name);

      if (isClicked) {
        rect
          .attr("filter", "url(#click-glow)")
          .style("transform", "scale(0.95)");
      } else if (isNewNode) {
        rect
          .attr("filter", "url(#new-node-glow)")
          .style("transform", "scale(1.02)");
      } else {
        rect
          .attr("filter", null)
          .style("transform", "scale(1)");
      }

      // Add transition animation for new nodes
      if (isNewNode) {
        rect.style("animation", "pulse 2s infinite");
      }
    });

    // Handle clicks with debouncing
    let clickTimeout;
    node.on("click", function(event, d) {
      event.preventDefault();
      if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
        handleDoubleClick(d);  // Shows TopicDetail on double click
      } else {
        clickTimeout = setTimeout(() => {
          clickTimeout = null;
          handleSingleClick(d);  // Expands node on single click
        }, 250);
      }
    });

    // Optimize the tick function
    let tickCount = 0;
    const maxTicks = 300; // Limit total number of ticks

    simulation.current.on("tick", () => {
      tickCount++;
      if (tickCount > maxTicks) {
        simulation.current.stop();
        return;
      }

      // Only update every other tick for performance
      if (tickCount % 2 === 0) {
        links.attr("d", d => {
          const dx = d.target.x - d.source.x;
          const dy = d.target.y - d.source.y;
          const dr = Math.sqrt(dx * dx + dy * dy) * 2;
          return `M${d.source.x},${d.source.y}A${dr},${dr} 0 0,1 ${d.target.x},${d.target.y}`;
        });

        node.attr("transform", d => `translate(${d.x},${d.y})`);
      }
    });

    // Stop simulation after it stabilizes
    simulation.current.on("end", () => {
      console.log("Simulation ended");
    });

    // Cleanup function
    return () => {
      if (simulation.current) {
        simulation.current.stop();
        simulation.current = null;
      }
      if (clickTimeout) {
        clearTimeout(clickTimeout);
      }
    };
  }, [treeData, handleSingleClick, handleDoubleClick, flattenNodes, createLinks, dragstarted, dragged, dragended]);

  // Add a new useEffect to handle component unmounting
  useEffect(() => {
    return () => {
        if (simulation.current) {
            simulation.current.stop();
            simulation.current = null;
        }
    };
  }, []);

  // Add handler for returning from detail view
  const handleBackFromDetail = (savedTreeData) => {
    setDetailView(null);
    if (savedTreeData) {
      setCurrentTreeData(savedTreeData);
      setTreeData(savedTreeData);
      treeDataRef.current = savedTreeData;
    }
  };

  // Update useEffect that handles tree data changes
  useEffect(() => {
    const loadTreeData = async () => {
      try {
        const response = await fetch("http://localhost:9000/tree");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        setTreeData(data);
        treeDataRef.current = data;
      } catch (error) {
        console.error("Error loading tree data:", error);
      }
    };

    loadTreeData();
  }, []); // Empty dependency array means this runs once on mount

  // Add this CSS to your component
  const styles = `
    @keyframes dash {
      to {
        stroke-dashoffset: -12;
      }
    }
    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    @keyframes pulse {
      0% {
        filter: url(#new-node-glow) brightness(1);
      }
      50% {
        filter: url(#new-node-glow) brightness(1.1);
      }
      100% {
        filter: url(#new-node-glow) brightness(1);
      }
    }
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(-10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .loading-spinner-small {
      width: 16px;
      height: 16px;
      border: 2px solid #E2E8F0;
      border-top: 2px solid #4A5568;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
  `;

  // Add the styles to the document head
  const styleSheet = document.createElement("style");
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);

  // Add loading overlay component
  const LoadingOverlay = ({ message }) => (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(255, 255, 255, 0.8)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    }}>
      <div style={{
        backgroundColor: 'white',
        padding: '20px 40px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '10px'
      }}>
        <div className="loading-spinner" style={{
          width: '30px',
          height: '30px',
          border: '3px solid #E2E8F0',
          borderTop: '3px solid #4A5568',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <div style={{ color: '#4A5568' }}>{message}</div>
      </div>
    </div>
  );

  return (
    <div style={{ 
      width: '100%', 
      height: '100vh',
      display: 'flex'
    }}>
      <div style={{
        position: 'relative',
        width: detailView ? '60%' : '100%',
        height: '100%',
        transition: 'width 0.3s ease'
      }}>
        <div style={{ 
          position: 'absolute', 
          top: '10px', 
          left: '10px', 
          zIndex: 1000,
          display: 'flex',
          gap: '10px'
        }}>
          <button 
            onClick={resetTree}
            style={{
              padding: '8px 16px',
              backgroundColor: '#F0F4F8',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              color: '#4A5568'
            }}
          >
            Reset Tree
          </button>
          <button 
            onClick={fitToScreen}
            style={{
              padding: '8px 16px',
              backgroundColor: '#F0F4F8',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              color: '#4A5568'
            }}
          >
            Fit to Screen
          </button>
          <div style={{ 
            backgroundColor: 'rgba(255, 255, 255, 0.9)', 
            padding: '8px 12px', 
            borderRadius: '4px',
            fontSize: '12px',
            color: '#4A5568',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
          }}>
            Navigation: 
            • Scroll to zoom 
            • Drag to pan 
            • Click to expand 
            • Double-click for details
          </div>
        </div>
        <svg ref={svgRef} style={{ 
          width: '100%', 
          height: '100%',
          cursor: 'grab',
          '&:active': {
            cursor: 'grabbing'
          }
        }}></svg>
      </div>

      {/* Side panel for TopicDetail */}
      {detailView && (
        <div style={{
          width: '40%',
          height: '100vh',
          borderLeft: '1px solid #E2E8F0',
          backgroundColor: 'white',
          overflowY: 'auto',
          position: 'relative',
          animation: 'slideIn 0.3s ease',
          boxShadow: '-4px 0 16px rgba(0,0,0,0.1)',
          zIndex: 1
        }}>
          <TopicDetail
            topic={detailView.topic}
            content={detailView.content}
            onBack={() => setDetailView(null)}
            isLoading={loadingDetail}
          />
        </div>
      )}

      {/* Loading overlays */}
      {loadingNodes && (
        <LoadingOverlay message="Generating new topics..." />
      )}
      {loadingDetail && !detailView && (
        <LoadingOverlay message="Loading topic details..." />
      )}
    </div>
  );
};

export default FamilyTree;



