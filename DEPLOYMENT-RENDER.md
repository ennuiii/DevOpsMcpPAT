# Deploy Azure DevOps MCP Server to Render.com

This guide shows you how to deploy the Azure DevOps MCP server to Render.com as a web service accessible via HTTP API.

## Prerequisites

1. **Azure DevOps Account** with access to your organization
2. **Personal Access Token (PAT)** from Azure DevOps
3. **Render.com Account** (free tier available)
4. **GitHub Repository** (forked or cloned from the original)

## Step 1: Create Personal Access Token

1. Go to Azure DevOps: `https://dev.azure.com/{your-organization}`
2. Click **User Settings** → **Personal Access Tokens**
3. Click **"New Token"**
4. Configure:
   - **Name**: `MCP Server Render`
   - **Organization**: Select your organization
   - **Expiration**: Set appropriate date (max 1 year)
   - **Scopes**: Select the following:
     - ✅ **Work Items**: Read & Write
     - ✅ **Code**: Read & Write  
     - ✅ **Build**: Read & Execute
     - ✅ **Release**: Read, Write & Execute
     - ✅ **Project and Team**: Read
     - ✅ **Analytics**: Read
     - ✅ **Test Management**: Read & Write
5. Click **"Create"** and **copy the token immediately**

## Step 2: Prepare Your Repository

### Option A: Fork the Repository
1. Fork the repository: `https://github.com/microsoft/azure-devops-mcp`
2. Clone your fork locally

### Option B: Use Existing Repository
If you already have the code, make sure you have these files:

```bash
# Copy the web deployment files
cp src/server-web.ts src/
cp package-web.json package.json
cp render.yaml ./
cp Dockerfile ./
cp .env.example ./
```

### Required Files for Deployment:
- `src/server-web.ts` - HTTP server wrapper
- `package.json` - Updated with web dependencies  
- `render.yaml` - Render deployment configuration
- `Dockerfile` - Container configuration
- `.env.example` - Environment variables template

## Step 3: Deploy to Render.com

### Method 1: Using Render Dashboard (Recommended)

1. **Login to Render.com**
   - Go to [render.com](https://render.com) and sign in
   - Connect your GitHub account if not already connected

2. **Create New Web Service**
   - Click **"New +"** → **"Web Service"**
   - Select **"Build and deploy from a Git repository"**
   - Choose your forked repository
   - Click **"Connect"**

3. **Configure Service Settings**
   - **Name**: `azure-devops-mcp-server` (or your preferred name)
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `node dist/server-web.js`
   - **Plan**: `Free` (or upgrade as needed)

4. **Set Environment Variables**
   Click **"Environment"** tab and add:
   
   | Key | Value | 
   |-----|-------|
   | `AZURE_DEVOPS_ORG` | `GOpus` (your organization name) |
   | `AZURE_DEVOPS_PAT` | `your-pat-token-here` |
   | `NODE_ENV` | `production` |

   ⚠️ **Important**: Mark `AZURE_DEVOPS_PAT` as **secret** by clicking the eye icon

5. **Deploy**
   - Click **"Create Web Service"**
   - Render will automatically build and deploy your service
   - Wait for deployment to complete (usually 2-5 minutes)

### Method 2: Using render.yaml (Automatic)

If you have `render.yaml` in your repository root, Render will automatically detect and use it:

1. Push the `render.yaml` file to your repository
2. Create a new web service and select your repository
3. Render will automatically use the configuration from `render.yaml`
4. You'll still need to set the environment variables manually in the dashboard

## Step 4: Configure Environment Variables

After deployment, you **must** set these environment variables in the Render dashboard:

### Required Environment Variables:

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `AZURE_DEVOPS_ORG` | Your Azure DevOps organization name | `GOpus` |
| `AZURE_DEVOPS_PAT` | Personal Access Token from Azure DevOps | `your-pat-token-here` |

### Optional Environment Variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP server port | `3000` (set by Render) |
| `NODE_ENV` | Node.js environment | `production` |

### How to Set Environment Variables:
1. Go to your service dashboard in Render
2. Click **"Environment"** tab
3. Click **"Add Environment Variable"**
4. Enter the key and value
5. For sensitive values like PAT token, mark as **secret**
6. Click **"Save Changes"**

## Step 5: Test Your Deployment

Once deployed, your service will be available at: `https://your-service-name.onrender.com`

### Test Endpoints:

1. **Health Check**
   ```bash
   curl https://your-service-name.onrender.com/health
   ```
   
   Expected response:
   ```json
   {
     "status": "healthy",
     "version": "1.3.1",
     "organization": "GOpus",
     "timestamp": "2025-08-19T12:00:00.000Z"
   }
   ```

2. **List Available Tools**
   ```bash
   curl https://your-service-name.onrender.com/api/tools
   ```

3. **Get Work Item (Example)**
   ```bash
   curl -X POST https://your-service-name.onrender.com/api/tools/wit_get_work_item \
     -H "Content-Type: application/json" \
     -d '{"id": 594, "project": "GOpus GmbH"}'
   ```

## Step 6: Using the API

### Available Endpoints:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | API documentation and service info |
| `GET` | `/health` | Health check |
| `GET` | `/api/tools` | List all available tools |
| `POST` | `/api/tools/{toolName}` | Call a specific tool |
| `POST` | `/mcp` | JSON-RPC 2.0 endpoint (MCP protocol) |

### Example: Get Work Item
```javascript
// JavaScript example
const response = await fetch('https://your-service-name.onrender.com/api/tools/wit_get_work_item', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: 594,
    project: "GOpus GmbH"
  })
});

const result = await response.json();
console.log(result);
```

### Example: List Projects
```bash
curl -X POST https://your-service-name.onrender.com/api/tools/core_list_projects \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Available Tools

The deployed server provides 66 tools across 10 categories:

- **Work Items** (19 tools): Create, update, get work items, comments, etc.
- **Builds** (9 tools): Get builds, definitions, logs, trigger builds
- **Repositories** (18 tools): Manage repos, pull requests, branches
- **Search** (3 tools): Search code, wiki, work items
- **Work Management** (3 tools): Manage iterations and teams
- **Releases** (2 tools): Get release definitions and releases
- **Wiki** (5 tools): Manage wiki pages and content
- **Test Plans** (6 tools): Manage test plans and cases
- **Core** (3 tools): List projects, teams, identities
- **Advanced Security** (2 tools): Get security alerts

See `/api/tools` endpoint for complete list with descriptions.

## Troubleshooting

### Common Issues:

1. **Build Fails**
   - Check that all dependencies are in `package.json`
   - Ensure TypeScript compiles without errors
   - Verify Node.js version compatibility (>=20.0.0)

2. **Environment Variables Not Set**
   - Verify `AZURE_DEVOPS_ORG` and `AZURE_DEVOPS_PAT` are set
   - Check that PAT token has required permissions
   - Ensure PAT token hasn't expired

3. **Authentication Errors**
   - Verify PAT token is valid and not expired
   - Check organization name is correct
   - Ensure PAT has required scopes (Work Items, Code, etc.)

4. **Service Won't Start**
   - Check logs in Render dashboard
   - Verify start command is correct: `node dist/server-web.js`
   - Ensure build completed successfully

### Checking Logs:
1. Go to your service in Render dashboard
2. Click **"Logs"** tab
3. Check for error messages
4. Look for successful startup message: "🌐 Azure DevOps MCP Server running on port 3000"

## Scaling and Limits

### Render.com Free Tier Limits:
- 750 hours/month (enough for always-on service)
- Services spin down after 15 minutes of inactivity
- Cold start time: ~30 seconds when spinning up

### Upgrading:
- Consider upgrading to **Starter** plan ($7/month) for:
  - No spin-down
  - Faster cold starts
  - More resources

## Security Best Practices

1. **Never commit secrets** to your repository
2. **Use environment variables** for all sensitive data
3. **Mark PAT tokens as secret** in Render dashboard
4. **Rotate PAT tokens regularly** (recommended: every 90 days)
5. **Use minimum required permissions** for PAT tokens
6. **Monitor service logs** for unauthorized access attempts

## Support

- **Service Issues**: Check Render.com documentation and support
- **Azure DevOps API Issues**: Refer to Azure DevOps REST API documentation
- **MCP Protocol**: See Model Context Protocol specification

## Example Service URL

After successful deployment, your service will be available at:
```
https://azure-devops-mcp-server-xyz.onrender.com
```

Replace `xyz` with your actual service identifier assigned by Render.