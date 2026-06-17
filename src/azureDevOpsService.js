const DEFAULT_API_VERSION = "7.1";
const MAX_WORK_ITEMS_BATCH_SIZE = 200;

export class AzureDevOpsService {
  constructor({ fetchImpl = globalThis.fetch, env = process.env } = {}) {
    if (typeof fetchImpl !== "function") {
      throw new Error("A fetch implementation is required. Use Node.js 20.11 or newer.");
    }

    this.fetch = fetchImpl;
    this.env = env;
  }

  async runWiql(options) {
    const context = this.resolveContext(options);
    // Azure DevOps WIQL queries are POSTed to the project-scoped Work Item Tracking endpoint.
    const url = buildWiqlUrl({
      ...context,
      top: options.top,
      timePrecision: options.timePrecision
    });

    const wiqlResult = await this.postJson(url, { query: options.wiql });

    if (!options.includeWorkItems) {
      return wiqlResult;
    }

    const ids = extractWorkItemIds(wiqlResult);

    if (ids.length === 0) {
      return { wiqlResult, workItems: [] };
    }

    const workItemsResult = await this.getWorkItems({
      ...context,
      ids,
      fields: options.fields,
      asOf: options.asOf,
      errorPolicy: options.errorPolicy,
      expand: options.expand
    });

    return {
      wiqlResult,
      workItems: workItemsResult.value ?? [],
      workItemsResult
    };
  }

  async getWorkItems(options) {
    const context = this.resolveContext(options);
    const ids = normalizeIds(options.ids);
    const batches = chunk(ids, MAX_WORK_ITEMS_BATCH_SIZE);
    const values = [];
    let count = 0;

    for (const batchIds of batches) {
      const url = buildWorkItemsBatchUrl(context);
      const body = buildWorkItemsBatchBody({
        ids: batchIds,
        fields: options.fields,
        asOf: options.asOf,
        errorPolicy: options.errorPolicy,
        expand: options.expand
      });
      const batchResult = await this.postJson(url, body);
      const batchValues = batchResult.value ?? [];

      values.push(...batchValues);
      count += batchResult.count ?? batchValues.length;
    }

    return { count, value: values };
  }

  resolveContext(options) {
    return {
      organizationUrl: requireValue(
        options.organizationUrl ?? this.env.AZURE_DEVOPS_ORG_URL,
        "organizationUrl or AZURE_DEVOPS_ORG_URL"
      ),
      project: requireValue(
        options.project ?? this.env.AZURE_DEVOPS_PROJECT,
        "project or AZURE_DEVOPS_PROJECT"
      ),
      apiVersion: options.apiVersion ?? this.env.AZURE_DEVOPS_API_VERSION ?? DEFAULT_API_VERSION
    };
  }

  async postJson(url, body) {
    const response = await this.fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        // Auth is read for this request only; this package has no credential persistence layer.
        Authorization: buildAuthorizationHeader(this.env)
      },
      body: JSON.stringify(body)
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

export function buildWorkItemsBatchUrl({ organizationUrl, project, apiVersion }) {
  const baseUrl = trimTrailingSlashes(organizationUrl);
  const encodedProject = encodeURIComponent(project);
  const url = new URL(`${baseUrl}/${encodedProject}/_apis/wit/workitemsbatch`);

  url.searchParams.set("api-version", apiVersion);

  return url;
}

export function buildWorkItemsBatchBody({ ids, fields, asOf, errorPolicy, expand }) {
  const body = { ids };

  if (fields?.length) {
    body.fields = fields;
  }

  if (asOf !== undefined) {
    body.asOf = asOf;
  }

  if (errorPolicy !== undefined) {
    body.errorPolicy = errorPolicy;
  }

  if (expand !== undefined) {
    body.$expand = expand;
  }

  return body;
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

export function extractWorkItemIds(wiqlResult) {
  const ids = new Set();

  for (const workItem of wiqlResult.workItems ?? []) {
    if (Number.isInteger(workItem?.id)) {
      ids.add(workItem.id);
    }
  }

  for (const relation of wiqlResult.workItemRelations ?? []) {
    if (Number.isInteger(relation?.source?.id)) {
      ids.add(relation.source.id);
    }

    if (Number.isInteger(relation?.target?.id)) {
      ids.add(relation.target.id);
    }
  }

  return [...ids];
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

function normalizeIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("At least one work item ID is required.");
  }

  return [...new Set(ids)];
}

function chunk(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}
