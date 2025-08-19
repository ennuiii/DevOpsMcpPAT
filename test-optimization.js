#!/usr/bin/env node

// Quick test to measure size reduction from optimizations
import { comprehensiveToolsComplete } from './dist/comprehensive-tools-complete.js';

// Mock tools for MCP with old format (pretty printed)
function getToolsForMcpOLD() {
  return comprehensiveToolsComplete.map(tool => ({
    name: tool.name,
    description: tool.description, // Full descriptions
    inputSchema: tool.inputSchema
  }));
}

// Mock tools for MCP with new format (ultra-minimal optimization)
function getToolsForMcpNEW() {
  return comprehensiveToolsComplete.map(tool => {
    // No description at all for maximum optimization
    const shortDesc = "";
    
    // Ultra-minimal schema with only essential MCP properties
    const optimizedSchema = {
      type: tool.inputSchema.type,
      properties: Object.fromEntries(
        Object.entries(tool.inputSchema.properties || {}).map(([key, prop]) => [
          key, 
          {
            type: prop.type,
            ...(prop.enum ? { enum: prop.enum } : {}),
            ...(prop.items ? { items: prop.items } : {})
          }
        ])
      ),
      ...(tool.inputSchema.required ? { required: tool.inputSchema.required } : {})
    };
    
    return {
      name: tool.name,
      description: shortDesc,
      inputSchema: optimizedSchema
    };
  });
}

// Simulate tools/list response with old format
const oldResponse = {
  jsonrpc: "2.0",
  id: "test-123",
  result: {
    tools: getToolsForMcpOLD()
  }
};

const oldResponsePretty = JSON.stringify(oldResponse, null, 2);
const oldResponseMinified = JSON.stringify(oldResponse);

// Simulate tools/list response with new format
const newResponse = {
  jsonrpc: "2.0", 
  id: "test-123",
  result: {
    tools: getToolsForMcpNEW()
  }
};

const newResponseMinified = JSON.stringify(newResponse);

// Calculate sizes and token counts (rough approximation: ~4 chars per token)
function getTokenCount(text) {
  return Math.ceil(text.length / 4);
}

console.log("=== AZURE DEVOPS MCP SERVER - OPTIMIZATION RESULTS ===");
console.log("");
console.log("📊 Size Comparison:");
console.log(`📁 Old (pretty):     ${Buffer.byteLength(oldResponsePretty, 'utf8')} bytes, ~${getTokenCount(oldResponsePretty)} tokens`);
console.log(`📁 Old (minified):   ${Buffer.byteLength(oldResponseMinified, 'utf8')} bytes, ~${getTokenCount(oldResponseMinified)} tokens`);
console.log(`📁 NEW (optimized):  ${Buffer.byteLength(newResponseMinified, 'utf8')} bytes, ~${getTokenCount(newResponseMinified)} tokens`);
console.log("");

const prettySavings = oldResponsePretty.length - newResponseMinified.length;
const prettySavingsPercent = Math.round((prettySavings / oldResponsePretty.length) * 100);
const minifiedSavings = oldResponseMinified.length - newResponseMinified.length;  
const minifiedSavingsPercent = Math.round((minifiedSavings / oldResponseMinified.length) * 100);

console.log("💰 Savings:");
console.log(`📉 vs Pretty:        -${prettySavings} bytes (-${prettySavingsPercent}%), ~${getTokenCount(oldResponsePretty) - getTokenCount(newResponseMinified)} tokens saved`);
console.log(`📉 vs Minified:      -${minifiedSavings} bytes (-${minifiedSavingsPercent}%), ~${getTokenCount(oldResponseMinified) - getTokenCount(newResponseMinified)} tokens saved`);
console.log("");

console.log(`🔧 Total tools:      ${comprehensiveToolsComplete.length}`);
console.log(`📦 Client reconnects: Every ~60 seconds (from logs)`);
console.log(`💸 Cost impact:      Each reconnection saves ~${getTokenCount(oldResponsePretty) - getTokenCount(newResponseMinified)} tokens`);