import mysql, { type RowDataPacket } from "mysql2/promise";

export interface SqlRunner {
  query<T>(sql: string, params?: (string | number)[]): Promise<T[]>;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in .env before searching the MLS database.`);
  return value;
}

let pool: mysql.Pool | undefined;

function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: required("MYSQL_HOST"),
      user: required("MYSQL_USER"),
      password: required("MYSQL_PASSWORD"),
      database: required("MYSQL_DATABASE"),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      decimalNumbers: true,
    });
  }
  return pool;
}

export const database: SqlRunner = {
  async query<T>(sql: string, params: (string | number)[] = []): Promise<T[]> {
    const [rows] = await getPool().execute<RowDataPacket[]>(sql, params);
    return rows as T[];
  },
};

export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
