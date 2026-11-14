import assert from "node:assert/strict";
import { test } from "node:test";
import { connect, createJournal, startWorkflow } from "../dist/index.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl === "") {
  throw new Error("DATABASE_URL is required");
}

test("startWorkflow stores the id, name, and arguments before any step", async () => {
  const connection = await connect(databaseUrl);
  const id = "workflow-start-1";
  try {
    await createJournal(connection);
    try {
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
    } finally {
      await connection.query("delete from lapsha_journal.workflow where id = $1", [id]);
    }
  } finally {
    await connection.close();
  }
});