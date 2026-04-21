import dotenv from "dotenv";
dotenv.config();

export type QueryResult<Row> = { rows: Row[] };

export type DbClient = {
  dialect: "postgres" | "sqlite";
  query<Row = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<Row>>;
  end(): Promise<void>;
};

function inferDialect(databaseUrl: string): "postgres" | "sqlite" {
  if (databaseUrl.startsWith("sqlite:")) return "sqlite";
  return "postgres";
}

function sqliteFilename(databaseUrl: string) {
  // Accept sqlite:./dev.db or sqlite:/abs/path.db
  const raw = databaseUrl.slice("sqlite:".length);
  return raw.startsWith("//") ? raw.slice(2) : raw;
}

function toSqliteSql(sql: string) {
  // Convert $1..$n placeholders to ? for better-sqlite3.
  return sql.replace(/\$\d+/g, "?");
}

async function createSqliteClient(databaseUrl: string): Promise<DbClient> {
  const Database = (await import("better-sqlite3")).default;
  const filename = sqliteFilename(databaseUrl) || "./dev.db";
  const sqlite = new Database(filename);

  return {
    dialect: "sqlite",
    async query<Row>(sql: string, params: unknown[] = []) {
      const stmt = sqlite.prepare(toSqliteSql(sql));
      const trimmed = sql.trim().toLowerCase();
      const isSelect =
        trimmed.startsWith("select") || trimmed.startsWith("with") || trimmed.includes(" returning ");

      if (isSelect) {
        const rows = stmt.all(params) as Row[];
        return { rows };
      }

      stmt.run(params);
      return { rows: [] as Row[] };
    },
    async end() {
      sqlite.close();
    },
  };
}

async function createPostgresClient(databaseUrl: string): Promise<DbClient> {
  const pg = await import("pg");
  const { Pool } = pg.default;
  const pool = new Pool({ connectionString: databaseUrl });

  return {
    dialect: "postgres",
    async query<Row>(sql: string, params: unknown[] = []) {
      const result = await pool.query(sql, params);
      return { rows: result.rows as Row[] };
    },
    async end() {
      await pool.end();
    },
  };
}

const databaseUrl = process.env.DATABASE_URL ?? "sqlite:./dev.db";
const dialect = inferDialect(databaseUrl);

export const db: Promise<DbClient> =
  dialect === "sqlite" ? createSqliteClient(databaseUrl) : createPostgresClient(databaseUrl);

