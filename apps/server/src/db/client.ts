import mysql from "mysql2/promise";
import { env } from "../config/env";

export const pool = mysql.createPool({
  host: env.MYSQL_HOST,
  port: env.MYSQL_PORT,
  user: env.MYSQL_USER,
  password: env.MYSQL_PASSWORD,
  database: env.MYSQL_DATABASE,
  connectionLimit: 10,
  multipleStatements: false
});

export async function select<T = Record<string, unknown>>(sql: string, values: unknown[] = []): Promise<T[]> {
  const [rows] = await pool.query(sql, values);
  return rows as T[];
}

export async function execute(sql: string, values: unknown[] = []): Promise<void> {
  await pool.execute(sql, values);
}
