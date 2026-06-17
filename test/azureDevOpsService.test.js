import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AzureDevOpsError,
  AzureDevOpsService,
  buildAuthorizationHeader,
  buildWiqlUrl
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
