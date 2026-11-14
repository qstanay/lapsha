import type { Connection } from "./connection.js";

const statements = [
  "create schema if not exists lapsha_journal",
  `
    create table if not exists lapsha_journal.workflow (
      id text primary key,
      name text not null,
      arguments jsonb not null
    )
  `,
  `
    create table if not exists lapsha_journal.step (
      workflow_id text not null references lapsha_journal.workflow (id),
      position integer not null check (position >= 0),
      name text not null,
      status text not null check (status in ('started', 'completed')),
      arguments jsonb not null,
      idempotency_key text,
      result jsonb,
      primary key (workflow_id, position)
    )
  `,
];

export async function createJournal(connection: Connection): Promise<void> {
  for (const statement of statements) {
    await connection.query(statement);
  }
}
