#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;
const AUTH0_CLIENT_SECRET = process.env.AUTH0_CLIENT_SECRET;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;

if (!AUTH0_DOMAIN || !AUTH0_CLIENT_ID || !AUTH0_CLIENT_SECRET) {
  throw new Error(
    "AUTH0_DOMAIN, AUTH0_CLIENT_ID, and AUTH0_CLIENT_SECRET environment variables are required"
  );
}

interface Auth0Application {
  client_id: string;
  name: string;
  app_type: string;
  callbacks: string[];
  allowed_origins: string[];
  web_origins: string[];
  allowed_logout_urls: string[];
  grant_types: string[];
  jwt_configuration?: {
    alg: string;
    lifetime_in_seconds: number;
  };
}

interface Auth0Token {
  access_token: string;
  token_type: string;
  expires_in: number;
}

class Auth0Server {
  private server: Server;
  private managementToken: string | null = null;
  private tokenExpiry: number = 0;

  constructor() {
    this.server = new Server(
      {
        name: "auth0-server",
        version: "0.1.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.setupResourceHandlers();
    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error("[MCP Error]", error);
    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  private async getManagementToken(): Promise<string> {
    // Check if we have a valid token
    if (this.managementToken && Date.now() < this.tokenExpiry) {
      return this.managementToken;
    }

    try {
      const response = await axios.post(`https://${AUTH0_DOMAIN}/oauth/token`, {
        client_id: AUTH0_CLIENT_ID,
        client_secret: AUTH0_CLIENT_SECRET,
        audience: `https://${AUTH0_DOMAIN}/api/v2/`,
        grant_type: "client_credentials",
      });

      const tokenData: Auth0Token = response.data;
      this.managementToken = tokenData.access_token;
      this.tokenExpiry = Date.now() + tokenData.expires_in * 1000 - 60000; // Subtract 1 minute for safety

      return this.managementToken;
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to get Auth0 management token: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private setupResourceHandlers() {
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: "auth0://applications",
          name: "Auth0 Applications",
          mimeType: "application/json",
          description: "List of all Auth0 applications in your tenant",
        },
        {
          uri: "auth0://tenant-settings",
          name: "Auth0 Tenant Settings",
          mimeType: "application/json",
          description: "Auth0 tenant configuration and settings",
        },
      ],
    }));

    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const token = await this.getManagementToken();

        if (request.params.uri === "auth0://applications") {
          try {
            const response = await axios.get(
              `https://${AUTH0_DOMAIN}/api/v2/clients`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            return {
              contents: [
                {
                  uri: request.params.uri,
                  mimeType: "application/json",
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to fetch applications: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
          }
        }

        if (request.params.uri === "auth0://tenant-settings") {
          try {
            const response = await axios.get(
              `https://${AUTH0_DOMAIN}/api/v2/tenants/settings`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            return {
              contents: [
                {
                  uri: request.params.uri,
                  mimeType: "application/json",
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          } catch (error) {
            throw new McpError(
              ErrorCode.InternalError,
              `Failed to fetch tenant settings: ${
                error instanceof Error ? error.message : "Unknown error"
              }`
            );
          }
        }

        throw new McpError(
          ErrorCode.InvalidRequest,
          `Unknown resource URI: ${request.params.uri}`
        );
      }
    );
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "get_application",
          description:
            "Get details of a specific Auth0 application by client ID",
          inputSchema: {
            type: "object",
            properties: {
              client_id: {
                type: "string",
                description: "The client ID of the Auth0 application",
              },
            },
            required: ["client_id"],
          },
        },
        {
          name: "list_applications",
          description: "List all Auth0 applications in the tenant",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "analyze_configuration",
          description: "Analyze Auth0 configuration for common issues",
          inputSchema: {
            type: "object",
            properties: {
              webapp_client_id: {
                type: "string",
                description: "Client ID used by the webapp",
              },
              api_client_id: {
                type: "string",
                description: "Client ID used by the API",
              },
              callback_url: {
                type: "string",
                description: "Expected callback URL",
              },
            },
            required: ["webapp_client_id"],
          },
        },
        {
          name: "get_tenant_settings",
          description: "Get Auth0 tenant settings and configuration",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const token = await this.getManagementToken();

      switch (request.params.name) {
        case "get_application": {
          const { client_id } = request.params.arguments as {
            client_id: string;
          };

          try {
            const response = await axios.get(
              `https://${AUTH0_DOMAIN}/api/v2/clients/${client_id}`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to get application: ${
                    error instanceof Error ? error.message : "Unknown error"
                  }`,
                },
              ],
              isError: true,
            };
          }
        }

        case "list_applications": {
          try {
            const response = await axios.get(
              `https://${AUTH0_DOMAIN}/api/v2/clients`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            const applications = response.data.map((app: Auth0Application) => ({
              client_id: app.client_id,
              name: app.name,
              app_type: app.app_type,
              callbacks: app.callbacks,
              allowed_origins: app.allowed_origins,
              web_origins: app.web_origins,
              grant_types: app.grant_types,
            }));

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(applications, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to list applications: ${
                    error instanceof Error ? error.message : "Unknown error"
                  }`,
                },
              ],
              isError: true,
            };
          }
        }

        case "analyze_configuration": {
          const { webapp_client_id, api_client_id, callback_url } = request
            .params.arguments as {
            webapp_client_id: string;
            api_client_id?: string;
            callback_url?: string;
          };

          try {
            const response = await axios.get(
              `https://${AUTH0_DOMAIN}/api/v2/clients`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            const applications = response.data;
            const webappApp = applications.find(
              (app: Auth0Application) => app.client_id === webapp_client_id
            );
            const apiApp = api_client_id
              ? applications.find(
                  (app: Auth0Application) => app.client_id === api_client_id
                )
              : null;

            const analysis = {
              webapp_application: webappApp
                ? {
                    found: true,
                    name: webappApp.name,
                    app_type: webappApp.app_type,
                    callbacks: webappApp.callbacks,
                    allowed_origins: webappApp.allowed_origins,
                    web_origins: webappApp.web_origins,
                    grant_types: webappApp.grant_types,
                  }
                : { found: false },
              api_application: apiApp
                ? {
                    found: true,
                    name: apiApp.name,
                    app_type: apiApp.app_type,
                    callbacks: apiApp.callbacks,
                    grant_types: apiApp.grant_types,
                  }
                : api_client_id
                ? { found: false, searched_for: api_client_id }
                : { not_provided: true },
              issues: [] as string[],
              recommendations: [] as string[],
            };

            // Check for common issues
            if (!webappApp) {
              analysis.issues.push(
                `Webapp client ID ${webapp_client_id} not found in Auth0 tenant`
              );
            } else {
              if (webappApp.app_type !== "spa") {
                analysis.issues.push(
                  `Webapp application type is '${webappApp.app_type}', should be 'spa' for Single Page Applications`
                );
                analysis.recommendations.push(
                  "Change application type to Single Page Application (SPA) in Auth0 dashboard"
                );
              }

              if (callback_url && !webappApp.callbacks.includes(callback_url)) {
                analysis.issues.push(
                  `Callback URL '${callback_url}' not configured in Auth0 application`
                );
                analysis.recommendations.push(
                  `Add '${callback_url}' to Allowed Callback URLs in Auth0 dashboard`
                );
              }

              if (!webappApp.grant_types.includes("authorization_code")) {
                analysis.issues.push(
                  "Authorization Code grant type not enabled"
                );
                analysis.recommendations.push(
                  "Enable Authorization Code grant type in Auth0 application settings"
                );
              }
            }

            if (api_client_id && !apiApp) {
              analysis.issues.push(
                `API client ID ${api_client_id} not found in Auth0 tenant`
              );
            }

            if (webapp_client_id === api_client_id) {
              analysis.issues.push(
                "Webapp and API are using the same client ID - this may cause authentication issues"
              );
              analysis.recommendations.push(
                "Consider using separate Auth0 applications for frontend and backend, or ensure proper configuration for shared application"
              );
            }

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(analysis, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to analyze configuration: ${
                    error instanceof Error ? error.message : "Unknown error"
                  }`,
                },
              ],
              isError: true,
            };
          }
        }

        case "get_tenant_settings": {
          try {
            const response = await axios.get(
              `https://${AUTH0_DOMAIN}/api/v2/tenants/settings`,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              }
            );

            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(response.data, null, 2),
                },
              ],
            };
          } catch (error) {
            return {
              content: [
                {
                  type: "text",
                  text: `Failed to get tenant settings: ${
                    error instanceof Error ? error.message : "Unknown error"
                  }`,
                },
              ],
              isError: true,
            };
          }
        }

        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Auth0 MCP server running on stdio");
  }
}

const server = new Auth0Server();
server.run().catch(console.error);
