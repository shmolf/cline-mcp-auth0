# Auth0 MCP Server

A Model Context Protocol server for Auth0 management and configuration analysis.

This TypeScript-based MCP server provides tools and resources for interacting with Auth0 tenants, allowing you to manage applications, analyze configurations, and troubleshoot common Auth0 setup issues.

## Features

### Resources

- **Auth0 Applications** (`auth0://applications`) - List of all Auth0 applications in your tenant
- **Auth0 Tenant Settings** (`auth0://tenant-settings`) - Auth0 tenant configuration and settings

### Tools

- **`get_application`** - Get details of a specific Auth0 application by client ID
  - Parameters: `client_id` (required)
- **`list_applications`** - List all Auth0 applications in the tenant
  - No parameters required
- **`analyze_configuration`** - Analyze Auth0 configuration for common issues
  - Parameters:
    - `webapp_client_id` (required) - Client ID used by the webapp
    - `api_client_id` (optional) - Client ID used by the API
    - `callback_url` (optional) - Expected callback URL
  - Provides detailed analysis of application configuration and identifies common issues
- **`get_tenant_settings`** - Get Auth0 tenant settings and configuration
  - No parameters required

## Prerequisites

You'll need an Auth0 Management API application with the following scopes:

- `read:clients`
- `read:tenant_settings`

## Environment Variables

The following environment variables are required:

```bash
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your-management-api-client-id
AUTH0_CLIENT_SECRET=your-management-api-client-secret
AUTH0_AUDIENCE=https://your-tenant.auth0.com/api/v2/
```

## Development

Install dependencies:

```bash
npm install
```

Build the server:

```bash
npm run build
```

For development with auto-rebuild:

```bash
npm run watch
```

## Installation

To use with Claude Desktop, add the server config:

On MacOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
On Windows: `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "auth0-custom": {
      "command": "node",
      "args": ["/path/to/auth0-server/build/index.js"],
      "env": {
        "AUTH0_DOMAIN": "your-tenant.auth0.com",
        "AUTH0_CLIENT_ID": "your-management-api-client-id",
        "AUTH0_CLIENT_SECRET": "your-management-api-client-secret",
        "AUTH0_AUDIENCE": "https://your-api-audience.com"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

**Note**: The `autoApprove` array allows these tools to run automatically without requiring manual approval each time, which is convenient for read-only operations like listing applications and analyzing configurations.

### Setting up Auth0 Management API

1. Go to your Auth0 Dashboard
2. Navigate to Applications → APIs
3. Select "Auth0 Management API"
4. Go to the "Machine to Machine Applications" tab
5. Authorize your application and grant the required scopes:
   - `read:clients`
   - `read:tenant_settings`

## Usage Examples

Once connected, you can use the server to:

- **List all applications**: Use the `list_applications` tool to get an overview of all Auth0 applications
- **Get specific application details**: Use `get_application` with a client ID to get detailed configuration
- **Analyze configuration issues**: Use `analyze_configuration` to identify common setup problems like:
  - Incorrect application types
  - Missing callback URLs
  - Grant type misconfigurations
  - Shared client IDs between frontend and backend
- **Access tenant settings**: Use `get_tenant_settings` to review tenant-level configuration

## Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npm run inspector
```

The Inspector will provide a URL to access debugging tools in your browser.

## Error Handling

The server includes comprehensive error handling for:

- Invalid Auth0 credentials
- Network connectivity issues
- Missing applications or resources
- API rate limiting
- Invalid client IDs or configuration parameters

All errors are returned with descriptive messages to help troubleshoot issues.
