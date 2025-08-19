# Azure DevOps MCP Server with PAT Authentication

A Model Context Protocol (MCP) server for Azure DevOps that uses Personal Access Token (PAT) authentication instead of Azure CLI. This server provides both CLI and HTTP API interfaces for interacting with Azure DevOps services.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

## ✨ Features

- **🔑 PAT Authentication**: Uses Personal Access Tokens instead of Azure CLI
- **🌐 HTTP API**: REST API endpoints for web applications
- **📡 MCP Protocol**: Full Model Context Protocol support
- **🚀 Deploy Ready**: Configured for Render.com deployment
- **🛠️ 75 Tools**: Comprehensive Azure DevOps functionality

## 🏗️ Architecture

This server provides two interfaces:

1. **CLI Interface** (`src/index.ts`) - Traditional MCP server via stdin/stdout
2. **Web Interface** (`src/server-web.ts`) - HTTP REST API for web deployment

## 🔧 Available Tools (75 Total)

### Work Items (19 tools)
- `wit_get_work_item` - Get work item by ID
- `wit_create_work_item` - Create new work item
- `wit_update_work_item` - Update work item fields
- `wit_my_work_items` - Get user's assigned work items
- `wit_add_work_item_comment` - Add comments
- `wit_list_backlogs` - List team backlogs
- `wit_link_work_item_to_pull_request` - Link work items to PRs
- And 12 more...

### Builds (9 tools)
- `build_get_builds` - List builds
- `build_run_build` - Trigger new build
- `build_get_log` - Get build logs
- `build_get_status` - Check build status
- And 5 more...

### Repositories (18 tools)
- `repo_create_pull_request` - Create pull requests
- `repo_list_pull_requests_by_repo` - List PRs
- `repo_get_pull_request_by_id` - Get PR details
- `repo_list_branches_by_repo` - List branches
- `repo_search_commits` - Search commits
- And 13 more...

### Search (3 tools)
- `search_code` - Search repositories
- `search_wiki` - Search wiki pages
- `search_workitem` - Search work items

### Other Categories
- **Work Management** (3 tools): Iterations and teams
- **Releases** (2 tools): Release definitions and deployments
- **Wiki** (5 tools): Wiki page management
- **Test Plans** (6 tools): Test management
- **Core** (3 tools): Projects and teams
- **Advanced Security** (2 tools): Security alerts

[See complete tool list](#complete-tool-reference)

## 🚀 Quick Start

### Option 1: Deploy to Render.com (Recommended)

1. **Fork this repository**
2. **Deploy to Render**:
   - Go to [render.com](https://render.com)
   - Create new **Web Service**
   - Connect your forked repository
   - Set environment variables (see below)
3. **Set Environment Variables**:
   ```
   AZURE_DEVOPS_ORG=your-organization-name
   AZURE_DEVOPS_PAT=your-personal-access-token
   ```
4. **Deploy** and get your URL: `https://your-service.onrender.com`

### Option 2: Local Development

```bash
# Clone repository
git clone https://github.com/ennuiii/DevOpsMcpPAT.git
cd DevOpsMcpPAT

# Install dependencies
npm install

# Set environment variables
export AZURE_DEVOPS_ORG="your-org"
export AZURE_DEVOPS_PAT="your-pat-token"

# Build and start
npm run build
npm start

# Server will be available at http://localhost:3000
```

## 🔑 Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `AZURE_DEVOPS_ORG` | Your Azure DevOps organization name | `contoso` |
| `AZURE_DEVOPS_PAT` | Personal Access Token | `your-token-here` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Node.js environment | `production` |

## 🎫 Creating a Personal Access Token

1. Go to Azure DevOps: `https://dev.azure.com/{your-organization}`
2. Click **User Settings** → **Personal Access Tokens**
3. Click **"New Token"**
4. Configure scopes:
   - ✅ **Work Items**: Read & Write
   - ✅ **Code**: Read & Write
   - ✅ **Build**: Read & Execute
   - ✅ **Release**: Read, Write & Execute
   - ✅ **Project and Team**: Read
   - ✅ **Analytics**: Read
   - ✅ **Test Management**: Read & Write

## 📡 API Endpoints

### Health & Info
- `GET /` - API documentation
- `GET /health` - Health check

### Tools
- `GET /api/tools` - List all available tools
- `POST /api/tools/{toolName}` - Call specific tool

### MCP Protocol
- `POST /mcp` - JSON-RPC 2.0 endpoint

## 🧪 Example Usage

### Get Work Item
```bash
curl -X POST https://your-service.onrender.com/api/tools/wit_get_work_item \
  -H "Content-Type: application/json" \
  -d '{"id": 123, "project": "MyProject"}'
```

### List Projects
```bash
curl -X POST https://your-service.onrender.com/api/tools/core_list_projects \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Search Code
```bash
curl -X POST https://your-service.onrender.com/api/tools/search_code \
  -H "Content-Type: application/json" \
  -d '{"searchText": "function", "project": ["MyProject"]}'
```

## 🏗️ Project Structure

```
├── src/
│   ├── index.ts              # CLI MCP server (PAT auth)
│   ├── server-web.ts         # HTTP server wrapper
│   ├── tools/                # Tool implementations
│   │   ├── workitems.ts     # Work item tools
│   │   ├── builds.ts        # Build tools
│   │   ├── repos.ts         # Repository tools
│   │   └── ...              # Other tool categories
│   ├── prompts.ts           # MCP prompts
│   └── utils.ts             # Utilities
├── package.json             # Dependencies & scripts
├── tsconfig.json           # TypeScript config
├── render.yaml             # Render deployment config
├── Dockerfile              # Container config
└── README.md               # This file
```

## 🔄 Differences from Original

| Feature | Original Azure DevOps MCP | This PAT Version |
|---------|---------------------------|------------------|
| **Authentication** | Azure CLI / DefaultAzureCredential | Personal Access Token |
| **Dependencies** | Requires @azure/identity | No Azure Identity SDK |
| **Setup** | Requires `az login` | Just needs PAT token |
| **Multi-tenant** | Yes (via --tenant flag) | No (PAT is org-specific) |
| **Web Interface** | No | Yes (HTTP API) |
| **Deployment** | Local only | Render.com ready |

## 🛠️ Development

### Build
```bash
npm run build
```

### Development Mode
```bash
npm run dev
```

### Testing
```bash
# Test CLI version
export AZURE_DEVOPS_PAT="your-token"
echo '{}' | node dist/index.js your-org

# Test web version
npm start
curl http://localhost:3000/health
```

## 📚 Complete Tool Reference

<details>
<summary>Click to expand all 75 tools</summary>

### Work Items (19 tools)
1. `wit_list_backlogs` - List team backlogs
2. `wit_list_backlog_work_items` - List backlog work items
3. `wit_my_work_items` - Get user's work items
4. `wit_get_work_items_batch_by_ids` - Batch get work items
5. `wit_get_work_item` - Get single work item
6. `wit_list_work_item_comments` - List work item comments
7. `wit_add_work_item_comment` - Add work item comment
8. `wit_add_child_work_items` - Create child work items
9. `wit_link_work_item_to_pull_request` - Link to PR
10. `wit_get_work_items_for_iteration` - Get iteration work items
11. `wit_update_work_item` - Update work item
12. `wit_get_work_item_type` - Get work item type
13. `wit_create_work_item` - Create work item
14. `wit_get_query` - Get query definition
15. `wit_get_query_results_by_id` - Execute query
16. `wit_update_work_items_batch` - Batch update
17. `wit_work_items_link` - Link work items
18. `wit_work_item_unlink` - Unlink work items
19. `wit_add_artifact_link` - Link artifacts

### Builds (9 tools)
1. `build_get_definitions` - List build definitions
2. `build_get_definition_revisions` - Get definition history
3. `build_get_builds` - List builds
4. `build_get_log` - Get build logs
5. `build_get_log_by_id` - Get specific log
6. `build_get_changes` - Get build changes
7. `build_run_build` - Trigger build
8. `build_get_status` - Get build status
9. `build_update_build_stage` - Update build stage

### Repositories (18 tools)
1. `repo_create_pull_request` - Create PR
2. `repo_update_pull_request` - Update PR
3. `repo_update_pull_request_reviewers` - Manage reviewers
4. `repo_list_repos_by_project` - List repositories
5. `repo_list_pull_requests_by_repo` - List PRs by repo
6. `repo_list_pull_requests_by_project` - List PRs by project
7. `repo_list_pull_request_threads` - List PR threads
8. `repo_list_pull_request_thread_comments` - List thread comments
9. `repo_list_branches_by_repo` - List branches
10. `repo_list_my_branches_by_repo` - List my branches
11. `repo_get_repo_by_name_or_id` - Get repository
12. `repo_get_branch_by_name` - Get branch
13. `repo_get_pull_request_by_id` - Get PR
14. `repo_reply_to_comment` - Reply to PR comment
15. `repo_create_pull_request_thread` - Create PR thread
16. `repo_resolve_comment` - Resolve PR comment
17. `repo_search_commits` - Search commits
18. `repo_list_pull_requests_by_commits` - Find PRs by commits

### Search (3 tools)
1. `search_code` - Search code repositories
2. `search_wiki` - Search wiki pages
3. `search_workitem` - Search work items

### Work Management (3 tools)
1. `work_list_team_iterations` - List team iterations
2. `work_create_iterations` - Create iterations
3. `work_assign_iterations` - Assign iterations to team

### Releases (2 tools)
1. `release_get_definitions` - List release definitions
2. `release_get_releases` - List releases

### Wiki (5 tools)
1. `wiki_list_wikis` - List wikis
2. `wiki_get_wiki` - Get wiki details
3. `wiki_list_pages` - List wiki pages
4. `wiki_get_page_content` - Get page content
5. `wiki_create_or_update_page` - Create/update page

### Test Plans (6 tools)
1. `testplan_list_test_plans` - List test plans
2. `testplan_create_test_plan` - Create test plan
3. `testplan_add_test_cases_to_suite` - Add test cases
4. `testplan_create_test_case` - Create test case
5. `testplan_list_test_cases` - List test cases
6. `testplan_show_test_results_from_build_id` - Get test results

### Core (3 tools)
1. `core_list_project_teams` - List project teams
2. `core_list_projects` - List projects
3. `core_get_identity_ids` - Get identity IDs

### Advanced Security (2 tools)
1. `advsec_get_alerts` - Get security alerts
2. `advsec_get_alert_details` - Get alert details

</details>

## 🐛 Troubleshooting

### Common Issues

**Authentication Failed**
- Verify PAT token is valid and not expired
- Check token has required scopes
- Ensure organization name is correct

**Service Won't Start**
- Check environment variables are set
- Verify Node.js version >= 20.0.0
- Check logs for specific error messages

**Tool Execution Fails**
- Ensure PAT has permissions for the specific operation
- Check project/repository names are correct
- Verify work item IDs exist

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 🔗 Links

- [Original Azure DevOps MCP](https://github.com/microsoft/azure-devops-mcp)
- [Model Context Protocol](https://github.com/modelcontextprotocol/specification)
- [Azure DevOps REST API](https://docs.microsoft.com/en-us/rest/api/azure/devops/)
- [Render.com Deployment Guide](./DEPLOYMENT-RENDER.md)

## ⭐ Star History

If this project helped you, please consider giving it a star! ⭐