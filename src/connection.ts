import { Client, type ClientConfig } from "pg";

export type ConnectionConfig = {
  readonly host?: string;
  readonly port?: number;
  readonly user?: string;
  readonly password?: string;
  readonly database?: string;
};

export type Connection = {
  query(
    sql: string,
    params?: readonly unknown[],
  ): Promise<readonly Record<string, unknown>[]>;
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

  constructor(client: Client) {
    this.#client = client;
  }

  async query(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<readonly Record<string, unknown>[]> {
    if (this.#closed) {
      throw new Error("Connection is closed");
    }
    const result = await this.#client.query(sql, [...params]);
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
