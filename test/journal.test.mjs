import assert from "node:assert/strict";
import { before, test } from "node:test";
import { connect, createJournal } from "../dist/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl === "") {
  throw new Error("DATABASE_URL is required");
}

before(async () => {
  const connection = await connect(databaseUrl);
  try {
    await connection.query("drop schema if exists lapsha cascade");
    await createJournal(connection);
  } finally {
    await connection.close();
  }
});

async function withConnection(run) {
  const connection = await connect(databaseUrl);
  try {
    await run(connection);
  } finally {
    await connection.close();
  }
}

test("createJournal can be applied twice", async () => {
  await withConnection(async (connection) => {
    await createJournal(connection);
    const rows = await connection.query(
      `
        select table_name
        from information_schema.tables
        where table_schema = 'lapsha_journal'
        order by table_name
      `,
    );
    assert.deepEqual(rows, [{ table_name: "step" }, { table_name: "workflow" }]);
  });
});

test("workflow stores its id, name, and arguments", async () => {
  await withConnection(async (connection) => {
    await connection.query(
      "insert into lapsha_journal.workflow (id, name, arguments) values ($1, $2, $3)",
      ["checkout-1", "checkout", { userId: "user-1" }],
    );
    try {
      const rows = await connection.query(
        "select id, name, arguments from lapsha_journal.workflow where id = $1",
        ["checkout-1"],
      );
      assert.deepEqual(rows, [
        { id: "checkout-1", name: "checkout", arguments: { userId: "user-1" } },
      ]);
    } finally {
      await connection.query("delete from lapsha_journal.workflow where id = $1", ["checkout-1"]);
    }
  });
});

test("step is stored by workflow and position", async () => {
  await withConnection(async (connection) => {
    await connection.query(
      "insert into lapsha_journal.workflow (id, name, arguments) values ($1, $2, $3)",
      ["checkout-2", "checkout", {}],
    );
    try {
      await connection.query(
        `
          insert into lapsha_journal.step
            (workflow_id, position, name, status, arguments)
          values ($1, 0, 'orders.create', 'started', $2)
        `,
        ["checkout-2", { userId: "user-1" }],
      );
      await connection.query(
        `
          insert into lapsha_journal.step
            (workflow_id, position, name, status, arguments, idempotency_key, result)
          values ($1, 1, 'payments.charge', 'completed', $2, $3, $4)
        `,
        ["checkout-2", { amount: 4990 }, "checkout-2:1", { id: "pay-1" }],
      );

      const rows = await connection.query(
        `
          select position, name, status, arguments, idempotency_key, result
          from lapsha_journal.step
          where workflow_id = $1
          order by position
        `,
        ["checkout-2"],
      );
      assert.deepEqual(rows, [
        {
          position: 0,
          name: "orders.create",
          status: "started",
          arguments: { userId: "user-1" },
          idempotency_key: null,
          result: null,
        },
        {
          position: 1,
          name: "payments.charge",
          status: "completed",
          arguments: { amount: 4990 },
          idempotency_key: "checkout-2:1",
          result: { id: "pay-1" },
        },
      ]);

      await assert.rejects(
        connection.query(
          `
            insert into lapsha_journal.step
              (workflow_id, position, name, status, arguments)
            values ($1, 0, 'orders.create', 'started', '{}')
          `,
          ["checkout-2"],
        ),
      );
      await assert.rejects(
        connection.query(
          `
            insert into lapsha_journal.step
              (workflow_id, position, name, status, arguments)
            values ($1, 2, 'orders.markPaid', 'failed', '{}')
          `,
          ["checkout-2"],
        ),
      );
      await assert.rejects(
        connection.query(
          `
            insert into lapsha_journal.step
              (workflow_id, position, name, status, arguments)
            values ('missing', 0, 'orders.create', 'started', '{}')
          `,
        ),
      );
    } finally {
      await connection.query("delete from lapsha_journal.step where workflow_id = $1", ["checkout-2"]);
      await connection.query("delete from lapsha_journal.workflow where id = $1", ["checkout-2"]);
    }
  });
});