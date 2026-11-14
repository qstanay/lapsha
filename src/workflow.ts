import type { Connection } from "./connection.js";

export type WorkflowRun = {
  readonly id: string;
  readonly name: string;
  readonly arguments: Readonly<Record<string, unknown>>;
};

export async function startWorkflow(connection: Connection, run: WorkflowRun): Promise<WorkflowRun> {
  const rows = await connection.query(
    `
      insert into lapsha_journal.workflow (id, name, arguments)
      values ($1, $2, $3)
      returning id, name, arguments
    `,
    [run.id, run.name, run.arguments],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Workflow was not stored");
  }
  return {
    id: text(row, "id"),
    name: text(row, "name"),
    arguments: record(row, "arguments"),
  };
}

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new Error(`Workflow ${key} was not stored`);
  }
  return value;
}

function record(row: Record<string, unknown>, key: string): Readonly<Record<string, unknown>> {
  const value = row[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Workflow ${key} was not stored`);
  }
  return value as Readonly<Record<string, unknown>>;
}
