#!/bin/bash
export ADO_MCP_AUTH_TOKEN="$AZURE_DEVOPS_PAT"
exec npx -y supergateway \
  --stdio "npx -y @azure-devops/mcp $AZURE_DEVOPS_ORG --authentication envvar" \
  --port ${PORT:-8000} \
  --outputTransport sse \
  --ssePath /sse \
  --messagePath /message \
  --cors \
  --healthEndpoint /health
