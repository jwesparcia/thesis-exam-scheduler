import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let server;
let api;
const stored = new Map();
const storage = {
  getItem: (key) => stored.get(key) || null,
  setItem: (key, value) => stored.set(key, value),
  removeItem: (key) => stored.delete(key),
};

before(async () => {
  // Load the actual browser module through Vite, with an Axios adapter below
  // instead of network requests. No backend or real browser session is used.
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: storage });
  globalThis.window = { location: { pathname: "/admin", href: "/admin" } };
  server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null, hmr: false } });
  ({ default: api } = await server.ssrLoadModule("/src/api.js"));
});

after(async () => {
  await server?.close();
});

const rejectResponse = (status, data) => (config) => Promise.reject({
  message: `Request failed with status code ${status}`,
  config,
  response: { status, data },
});

test("download errors decode the JSON blob and retain the actual cause", async () => {
  const detail = "Export failed. Required data is missing. Developer details: KeyError: 'section_name'";
  await assert.rejects(api.get("/exams/download", {
    responseType: "blob",
    adapter: rejectResponse(500, new Blob([JSON.stringify({ detail })], { type: "application/json" })),
  }), (error) => {
    assert.equal(error.response.status, 500);
    assert.equal(error.response.data.detail, detail);
    return true;
  });
});

test("download errors also preserve a plain text cause", async () => {
  await assert.rejects(api.get("/catalog/download-students-dummy", {
    responseType: "blob",
    adapter: rejectResponse(500, new Blob(["Student template file was not found"])),
  }), (error) => {
    assert.equal(error.response.data.detail, "Student template file was not found");
    return true;
  });
});

test("ordinary API errors keep server messages and other response fields", async () => {
  await assert.rejects(api.post("/exams/generate", {}, {
    adapter: rejectResponse(500, { detail: "No available rooms for BSCS 4-101", code: "NO_ROOMS" }),
  }), (error) => {
    assert.equal(error.response.data.detail, "No available rooms for BSCS 4-101");
    assert.equal(error.response.data.code, "NO_ROOMS");
    return true;
  });
});

test("network failures retain connectivity and request information", async () => {
  await assert.rejects(api.get("/exams/generate/progress", {
    adapter: (config) => Promise.reject({ message: "Network Error", config }),
  }), (error) => {
    assert.equal(error.response.status, 0);
    assert.match(error.response.data.detail, /Network Error/);
    assert.match(error.response.data.detail, /GET \/exams\/generate\/progress/);
    return true;
  });
});

test("session invalidation still signs out the user and keeps the reason", async () => {
  stored.set("user", JSON.stringify({ access_token: "test-token" }));
  await assert.rejects(api.get("/catalog/courses", {
    adapter: rejectResponse(401, { detail: "Session superseded by another login" }),
  }), (error) => {
    assert.equal(error.response.data.detail, "Session superseded by another login");
    assert.equal(stored.has("user"), false);
    assert.match(stored.get("auth_notice"), /another device or browser/);
    assert.equal(globalThis.window.location.href, "/login");
    return true;
  });
});
