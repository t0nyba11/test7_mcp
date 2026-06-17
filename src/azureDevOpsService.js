const DEFAULT_API_VERSION = "7.1";

export class AzureDevOpsService {
  constructor({ fetchImpl = globalThis.fetch, env = process.env } = {}) {
    if (typeof fetchImpl !== "function") {
      throw new Error("A fetch implementation is required. Use Node.js 20.11 or newer.");
    }

    this.fetch = fetchImpl;
    this.env = env;
  }

  async runWiql(options) {
    const organizationUrl = requireValue(
      options.organizationUrl ?? this.env.AZURE_DEVOPS_ORG_URL,
      "organizationUrl or AZURE_DEVOPS_ORG_URL"
    );
    const project = requireValue(
      options.project ?? this.env.AZURE_DEVOPS_PROJECT,
      "project or AZURE_DEVOPS_PROJECT"
    );
    const apiVersion = options.apiVersion ?? this.env.AZURE_DEVOPS_API_VERSION ?? DEFAULT_API_VERSION;
    // Azure DevOps WIQL queries are POSTed to the project-scoped Work Item Tracking endpoint.
    const url = buildWiqlUrl({
      organizationUrl,
      project,
      apiVersion,
      top: options.top,
      timePrecision: options.timePrecision
    });

    const response = await this.fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        // Auth is read for this request only; this package has no credential persistence layer.
        Authorization: buildAuthorizationHeader(this.env)
      },
      body: JSON.stringify({ query: options.wiql })
    });

    const responseText = await response.text();
    const payload = parseJsonResponse(responseText);

    if (!response.ok) {
      throw new AzureDevOpsError({
        status: response.status,
        statusText: response.statusText,
        payload
      });
    }

    return payload;
  }
}

export class AzureDevOpsError extends Error {
  constructor({ status, statusText, payload }) {
    const message =
      payload?.message ??
      payload?.Message ??
      `Azure DevOps request failed with HTTP ${status} ${statusText}`;

    super(message);
    this.name = "AzureDevOpsError";
    this.status = status;
    this.statusText = statusText;
    this.payload = payload;
  }
}

export function buildWiqlUrl({ organizationUrl, project, apiVersion, top, timePrecision }) {
  const baseUrl = trimTrailingSlashes(organizationUrl);
  const encodedProject = encodeURIComponent(project);
  const url = new URL(`${baseUrl}/${encodedProject}/_apis/wit/wiql`);

  url.searchParams.set("api-version", apiVersion);

  if (top !== undefined) {
    url.searchParams.set("$top", String(top));
  }

  if (timePrecision !== undefined) {
    url.searchParams.set("timePrecision", String(timePrecision));
  }

  return url;
}

export function buildAuthorizationHeader(env) {
  if (env.AZURE_DEVOPS_BEARER_TOKEN) {
    return `Bearer ${env.AZURE_DEVOPS_BEARER_TOKEN}`;
  }

  if (env.AZURE_DEVOPS_PAT) {
    return `Basic ${Buffer.from(`:${env.AZURE_DEVOPS_PAT}`, "utf8").toString("base64")}`;
  }

  throw new Error("Authentication is required. Set AZURE_DEVOPS_PAT or AZURE_DEVOPS_BEARER_TOKEN.");
}

function parseJsonResponse(responseText) {
  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return { raw: responseText };
  }
}

function requireValue(value, name) {
  if (!value) {
    throw new Error(`Missing required value: ${name}.`);
  }

  return value;
}

function trimTrailingSlashes(value) {
  return value.replace(/\/+$/, "");
}
