import assert from "node:assert/strict";
import { test } from "node:test";
import { connect } from "../dist/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl === "") {
  throw new Error("DATABASE_URL is required");
}

let tableSequence = 0;

async function withTable(run) {
  const table = `lapsha_tx_${tableSequence++}`;
  const connection = await connect(databaseUrl);
  await connection.query(`create table ${table} (id integer primary key)`);
  try {
    await run(connection, table);
  } finally {
    try {
      await connection.query(`drop table if exists ${table}`);
    } finally {
      await connection.close();
    }
  }
}

test("transaction commits every statement and returns the callback result", async () => {
  await withTable(async (connection, table) => {
    const result = await connection.transaction(async (tx) => {
      await tx.query(`insert into ${table} (id) values (1)`);
      await tx.query(`insert into ${table} (id) values (2)`);
      return "saved";
    });

    assert.equal(result, "saved");
    const rows = await connection.query(`select id from ${table} order by id`);
    assert.deepEqual(rows, [{ id: 1 }, { id: 2 }]);
  });
});

test("transaction rolls back every statement when the callback throws", async () => {
  await withTable(async (connection, table) => {
    await assert.rejects(
      connection.transaction(async (tx) => {
        await tx.query(`insert into ${table} (id) values (1)`);
        await tx.query(`insert into ${table} (id) values (2)`);
        throw new Error("nope");
      }),
      /nope/,
    );

    const rows = await connection.query(`select id from ${table}`);
    assert.deepEqual(rows, []);
  });
});

test("a second transaction on the same connection is rejected and the first rolls back", async () => {
  await withTable(async (connection, table) => {
    await assert.rejects(
      connection.transaction(async (tx) => {
        await tx.query(`insert into ${table} (id) values (1)`);
        await connection.transaction(async () => {});
      }),
      /A transaction is already open/,
    );

    const rows = await connection.query(`select id from ${table}`);
    assert.deepEqual(rows, []);
  });
});

test("transaction on a closed connection fails", async () => {
  const connection = await connect(databaseUrl);
  await connection.close();
  await assert.rejects(connection.transaction(async () => "unused"), /Connection is closed/);
});