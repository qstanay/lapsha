import assert from "node:assert/strict";
import { test } from "node:test";
import { connect, createJournal, startWorkflow } from "../dist/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl === "") {
  throw new Error("DATABASE_URL is required");
}

test("startWorkflow stores the id, name, and arguments before any step", async () => {
  const id = "workflow-start-1";
  await withWorkflow(id, async (connection) => {
    const stored = await startWorkflow(connection, {
      id,
      name: "checkout",
      arguments: { userId: "user-1", amount: 4990 },
    });

    assert.deepEqual(stored, {
      id,
      name: "checkout",
      arguments: { userId: "user-1", amount: 4990 },
    });
    const workflows = await connection.query(
      "select id, name, arguments from lapsha_journal.workflow where id = $1",
      [id],
    );
    assert.deepEqual(workflows, [stored]);
    const steps = await connection.query(
      "select workflow_id from lapsha_journal.step where workflow_id = $1",
      [id],
    );
    assert.deepEqual(steps, []);
  });
});

test("startWorkflow continues a stored run when the id, name, and arguments match", async () => {
  const id = "workflow-start-2";
  const run = {
    id,
    name: "checkout",
    arguments: { userId: "user-1", amount: 4990 },
  };
  await withWorkflow(id, async (connection) => {
    const stored = await startWorkflow(connection, run);
    const continued = await startWorkflow(connection, {
      id,
      name: "checkout",
      arguments: { amount: 4990, userId: "user-1" },
    });

    assert.deepEqual(continued, stored);
    const workflows = await connection.query(
      "select id, name, arguments from lapsha_journal.workflow where id = $1",
      [id],
    );
    assert.deepEqual(workflows, [stored]);
    const steps = await connection.query(
      "select workflow_id from lapsha_journal.step where workflow_id = $1",
      [id],
    );
    assert.deepEqual(steps, []);
  });
});

test("startWorkflow rejects the same id when the arguments differ", async () => {
  const id = "workflow-start-3";
  const run = {
    id,
    name: "checkout",
    arguments: { userId: "user-1", amount: 4990 },
  };
  await withWorkflow(id, async (connection) => {
    await startWorkflow(connection, run);
    await assert.rejects(
      startWorkflow(connection, {
        id,
        name: "checkout",
        arguments: { userId: "user-1", amount: 1000 },
      }),
      { message: "Workflow does not match the stored run" },
    );

    const workflows = await connection.query(
      "select id, name, arguments from lapsha_journal.workflow where id = $1",
      [id],
    );
    assert.deepEqual(workflows, [run]);
  });
});

test("startWorkflow rejects the same id when the name differs", async () => {
  const id = "workflow-start-4";
  const run = {
    id,
    name: "checkout",
    arguments: { userId: "user-1", amount: 4990 },
  };
  await withWorkflow(id, async (connection) => {
    await startWorkflow(connection, run);
    await assert.rejects(
      startWorkflow(connection, {
        id,
        name: "refund",
        arguments: { userId: "user-1", amount: 4990 },
      }),
      { message: "Workflow does not match the stored run" },
    );

    const workflows = await connection.query(
      "select id, name, arguments from lapsha_journal.workflow where id = $1",
      [id],
    );
    assert.deepEqual(workflows, [run]);
  });
});

test("startWorkflow keeps one run when two calls use the same id and different arguments", async () => {
  const id = "workflow-start-6";
  const checkout = {
    id,
    name: "checkout",
    arguments: { userId: "user-1", amount: 4990 },
  };
  const other = {
    id,
    name: "checkout",
    arguments: { userId: "user-1", amount: 1000 },
  };
  const first = await connect(databaseUrl);
  const second = await connect(databaseUrl);
  try {
    await createJournal(first);
    try {
      const results = await Promise.allSettled([
        startWorkflow(first, checkout),
        startWorkflow(second, other),
      ]);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");
      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 1);
      assert.equal(rejected[0].reason.message, "Workflow does not match the stored run");
      const workflows = await first.query(
        "select id, name, arguments from lapsha_journal.workflow where id = $1",
        [id],
      );
      assert.deepEqual(workflows, [fulfilled[0].value]);
    } finally {
      await first.query("delete from lapsha_journal.workflow where id = $1", [id]);
    }
  } finally {
    await first.close();
    await second.close();
  }
});

test("startWorkflow stores one run when two calls use the same id", async () => {
  const id = "workflow-start-5";
  const run = {
    id,
    name: "checkout",
    arguments: { userId: "user-1", amount: 4990 },
  };
  const first = await connect(databaseUrl);
  const second = await connect(databaseUrl);
  try {
    await createJournal(first);
    try {
      const [left, right] = await Promise.all([
        startWorkflow(first, run),
        startWorkflow(second, run),
      ]);

      assert.deepEqual(left, run);
      assert.deepEqual(right, run);
      const workflows = await first.query(
        "select id, name, arguments from lapsha_journal.workflow where id = $1",
        [id],
      );
      assert.deepEqual(workflows, [run]);
    } finally {
      await first.query("delete from lapsha_journal.workflow where id = $1", [id]);
    }
  } finally {
    await first.close();
    await second.close();
  }
});

async function withWorkflow(id, run) {
  const connection = await connect(databaseUrl);
  try {
    await createJournal(connection);
    try {
      await run(connection);
    } finally {
      await connection.query("delete from lapsha_journal.workflow where id = $1", [id]);
    }
  } finally {
    await connection.close();
  }
}