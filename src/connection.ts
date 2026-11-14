import { Client, type ClientConfig } from "pg";

export type ConnectionConfig = {
  readonly host?: string;
  readonly port?: number;
  readonly user?: string;
  readonly password?: string;
  readonly database?: string;
};

export type Transaction = {
  query(
    sql: string,
    params?: readonly unknown[],
  ): Promise<readonly Record<string, unknown>[]>;
};

export type Connection = Transaction & {
  transaction<T>(run: (tx: Transaction) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

export async function connect(config: string | ConnectionConfig): Promise<Connection> {
  const client = new Client(toClientConfig(config));
  await client.connect();
  return new PostgresConnection(client);
}

class PostgresConnection implements Connection {
  #client: Client;
  #closed = false;
  #inTransaction = false;

  constructor(client: Client) {
    this.#client = client;
  }

  async transaction<T>(run: (tx: Transaction) => Promise<T>): Promise<T> {
    if (this.#closed) {
      throw new Error("Connection is closed");
    }
    if (this.#inTransaction) {
      throw new Error("A transaction is already open");
    }

    this.#inTransaction = true;
    const tx: Transaction = {
      query: (sql, params) => this.#query(sql, params),
    };
    try {
      await this.#query("begin");
      try {
        const result = await run(tx);
        await this.#query("commit");
        return result;
      } catch (error) {
        try {
          await this.#query("rollback");
        } catch {
          // The callback error is the one to report.
        }
        throw error;
      }
    } finally {
      this.#inTransaction = false;
    }
  }

  query(
    sql: string,
    params?: readonly unknown[],
  ): Promise<readonly Record<string, unknown>[]> {
    return this.#query(sql, params);
  }

  async #query(
    sql: string,
    params?: readonly unknown[],
  ): Promise<readonly Record<string, unknown>[]> {
    if (this.#closed) {
      throw new Error("Connection is closed");
    }
    const values = params === undefined ? [] : [...params];
    const result = await this.#client.query(sql, values);
    return result.rows as Record<string, unknown>[];
  }

  async close(): Promise<void> {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    await this.#client.end();
  }
}

function toClientConfig(config: string | ConnectionConfig): ClientConfig {
  if (typeof config === "string") {
    return { connectionString: config };
  }

  const clientConfig: ClientConfig = {};
  if (config.host !== undefined) {
    clientConfig.host = config.host;
  }
  if (config.port !== undefined) {
    clientConfig.port = config.port;
  }
  if (config.user !== undefined) {
    clientConfig.user = config.user;
  }
  if (config.password !== undefined) {
    clientConfig.password = config.password;
  }
  if (config.database !== undefined) {
    clientConfig.database = config.database;
  }
  return clientConfig;
}
