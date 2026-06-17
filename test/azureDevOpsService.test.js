import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AzureDevOpsError,
  AzureDevOpsService,
  buildAuthorizationHeader,
  buildWiqlUrl,
  buildWorkItemsBatchBody,
  buildWorkItemsBatchUrl,
  extractWorkItemIds
} from "../src/azureDevOpsService.js";

test("buildWiqlUrl builds an Azure DevOps WIQL endpoint", () => {
  const url = buildWiqlUrl({
    organizationUrl: "https://dev.azure.com/example/",
    project: "Project With Spaces",
    apiVersion: "7.1",
    top: 25,
    timePrecision: true
  });

  assert.equal(
    url.toString(),
    "https://dev.azure.com/example/Project%20With%20Spaces/_apis/wit/wiql?api-version=7.1&%24top=25&timePrecision=true"
  );
});

test("buildAuthorizationHeader prefers bearer token over PAT", () => {
  assert.equal(
    buildAuthorizationHeader({
      AZURE_DEVOPS_BEARER_TOKEN: "token",
      AZURE_DEVOPS_PAT: "pat"
    }),
    "Bearer token"
  );
});

test("buildAuthorizationHeader supports PAT basic auth", () => {
  assert.equal(
    buildAuthorizationHeader({ AZURE_DEVOPS_PAT: "pat" }),
    `Basic ${Buffer.from(":pat", "utf8").toString("base64")}`
  );
});

test("buildWorkItemsBatchUrl builds a batch endpoint", () => {
  const url = buildWorkItemsBatchUrl({
    organizationUrl: "https://dev.azure.com/example/",
    project: "Project With Spaces",
    apiVersion: "7.1"
  });

  assert.equal(
    url.toString(),
    "https://dev.azure.com/example/Project%20With%20Spaces/_apis/wit/workitemsbatch?api-version=7.1"
  );
});

test("buildWorkItemsBatchBody includes requested fields and options", () => {
  assert.deepEqual(
    buildWorkItemsBatchBody({
      ids: [1, 2],
      fields: ["System.Id", "System.Title"],
      asOf: "2026-01-01T00:00:00Z",
      errorPolicy: "omit",
      expand: "relations"
    }),
    {
      ids: [1, 2],
      fields: ["System.Id", "System.Title"],
      asOf: "2026-01-01T00:00:00Z",
      errorPolicy: "omit",
      $expand: "relations"
    }
  );
});

test("extractWorkItemIds supports flat and relation WIQL results", () => {
  assert.deepEqual(
    extractWorkItemIds({
      workItems: [{ id: 1 }, { id: 2 }],
      workItemRelations: [
        { source: { id: 2 }, target: { id: 3 } },
        { source: null, target: { id: 4 } }
      ]
    }),
    [1, 2, 3, 4]
  );
});

test("runWiql posts the provided query without persisting auth", async () => {
  let request;
  const service = new AzureDevOpsService({
    env: {
      AZURE_DEVOPS_ORG_URL: "https://dev.azure.com/example",
      AZURE_DEVOPS_PROJECT: "MyProject",
      AZURE_DEVOPS_PAT: "pat"
    },
    fetchImpl: async (url, init) => {
      request = { url: url.toString(), init };
      return new Response(JSON.stringify({ workItems: [{ id: 1 }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
  });

  const result = await service.runWiql({ wiql: "SELECT [System.Id] FROM WorkItems", top: 1 });

  assert.deepEqual(result, { workItems: [{ id: 1 }] });
  assert.match(request.url, /^https:\/\/dev\.azure\.com\/example\/MyProject\/_apis\/wit\/wiql/);
  assert.equal(request.init.method, "POST");
  assert.deepEqual(JSON.parse(request.init.body), {
    query: "SELECT [System.Id] FROM WorkItems"
  });
});

test("getWorkItems posts requested IDs and fields", async () => {
  let request;
  const service = new AzureDevOpsService({
    env: {
      AZURE_DEVOPS_ORG_URL: "https://dev.azure.com/example",
      AZURE_DEVOPS_PROJECT: "MyProject",
      AZURE_DEVOPS_PAT: "pat"
    },
    fetchImpl: async (url, init) => {
      request = { url: url.toString(), init };
      return new Response(
        JSON.stringify({
          count: 1,
          value: [{ id: 1, fields: { "System.Title": "Title" } }]
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  });

  const result = await service.getWorkItems({
    ids: [1],
    fields: ["System.Id", "System.Title"],
    errorPolicy: "omit"
  });

  assert.deepEqual(result, {
    count: 1,
    value: [{ id: 1, fields: { "System.Title": "Title" } }]
  });
  assert.match(
    request.url,
    /^https:\/\/dev\.azure\.com\/example\/MyProject\/_apis\/wit\/workitemsbatch/
  );
  assert.deepEqual(JSON.parse(request.init.body), {
    ids: [1],
    fields: ["System.Id", "System.Title"],
    errorPolicy: "omit"
  });
});

test("getWorkItems splits requests into Azure DevOps batch-sized chunks", async () => {
  const requestBodies = [];
  const ids = Array.from({ length: 201 }, (_, index) => index + 1);
  const service = new AzureDevOpsService({
    env: {
      AZURE_DEVOPS_ORG_URL: "https://dev.azure.com/example",
      AZURE_DEVOPS_PROJECT: "MyProject",
      AZURE_DEVOPS_PAT: "pat"
    },
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      requestBodies.push(body);
      return new Response(
        JSON.stringify({
          count: body.ids.length,
          value: body.ids.map((id) => ({ id }))
        }),
        { status: 200 }
      );
    }
  });

  const result = await service.getWorkItems({ ids });

  assert.equal(result.count, 201);
  assert.equal(result.value.length, 201);
  assert.equal(requestBodies.length, 2);
  assert.equal(requestBodies[0].ids.length, 200);
  assert.deepEqual(requestBodies[1].ids, [201]);
});

test("runWiql can return hydrated work item fields", async () => {
  const requestBodies = [];
  const service = new AzureDevOpsService({
    env: {
      AZURE_DEVOPS_ORG_URL: "https://dev.azure.com/example",
      AZURE_DEVOPS_PROJECT: "MyProject",
      AZURE_DEVOPS_PAT: "pat"
    },
    fetchImpl: async (url, init) => {
      requestBodies.push(JSON.parse(init.body));

      if (url.toString().includes("/wiql?")) {
        return new Response(JSON.stringify({ workItems: [{ id: 1 }] }), { status: 200 });
      }

      return new Response(
        JSON.stringify({
          count: 1,
          value: [{ id: 1, fields: { "System.Title": "Title" } }]
        }),
        { status: 200 }
      );
    }
  });

  const result = await service.runWiql({
    wiql: "SELECT [System.Id], [System.Title] FROM WorkItems",
    includeWorkItems: true,
    fields: ["System.Id", "System.Title"]
  });

  assert.deepEqual(result.workItems, [{ id: 1, fields: { "System.Title": "Title" } }]);
  assert.deepEqual(requestBodies, [
    { query: "SELECT [System.Id], [System.Title] FROM WorkItems" },
    { ids: [1], fields: ["System.Id", "System.Title"] }
  ]);
});

test("runWiql surfaces Azure DevOps errors", async () => {
  const service = new AzureDevOpsService({
    env: {
      AZURE_DEVOPS_ORG_URL: "https://dev.azure.com/example",
      AZURE_DEVOPS_PROJECT: "MyProject",
      AZURE_DEVOPS_PAT: "pat"
    },
    fetchImpl: async () =>
      new Response(JSON.stringify({ message: "Bad WIQL" }), {
        status: 400,
        statusText: "Bad Request"
      })
  });

  await assert.rejects(
    () => service.runWiql({ wiql: "bad" }),
    (error) => error instanceof AzureDevOpsError && error.status === 400 && error.message === "Bad WIQL"
  );
});
