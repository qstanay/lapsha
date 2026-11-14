import assert from "node:assert/strict";
import { test } from "node:test";
import { connect } from "../dist/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl === "") {
  throw new Error("DATABASE_URL is required");
}

function configFromUrl(urlString) {
  const url = new URL(urlString);
  const database = url.pathname.replace(/^\//, "");
  return {
    host: url.hostname,
    port: Number(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
  };
}

test("connects with a connection string and runs a query", async () => {
  const connection = await connect(databaseUrl);
  try {
    const rows = await connection.query("select $1::int as value", [7]);
    assert.deepEqual(rows, [{ value: 7 }]);
  } finally {
    await connection.close();
  }
});

test("connects with a configuration object", async () => {
  const connection = await connect(configFromUrl(databaseUrl));
  try {
    const rows = await connection.query("select 1 as value");
    assert.deepEqual(rows, [{ value: 1 }]);
  } finally {
    await connection.close();
  }
});

test("close is idempotent and further queries fail", async () => {
  const connection = await connect(databaseUrl);
  await connection.close();
  await connection.close();
  await assert.rejects(connection.query("select 1"), /Connection is closed/);
});

test("connect rejects an unreachable server", async () => {
  const config = configFromUrl(databaseUrl);
  await assert.rejects(connect({ ...config, port: 1 }));
});