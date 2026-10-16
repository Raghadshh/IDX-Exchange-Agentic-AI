import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { closeDatabase, database } from "./db.ts";
import { newSession, replyToMessage, type UserSession } from "./conversation.ts";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const userId = argument("--user")?.trim();
  const message = argument("--message")?.trim();
  if (!userId || !message) throw new Error("Use --user <sender id> --message <text>.");
  const directory = process.env.PROPERTY_SEARCH_SESSION_DIR || path.join(process.cwd(), ".sessions");
  const filename = `${createHash("sha256").update(userId).digest("hex")}.json`;
  const file = path.join(directory, filename);
  let session: UserSession;
  try {
    session = JSON.parse(await readFile(file, "utf8")) as UserSession;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    session = newSession();
  }
  const result = await replyToMessage(database, session, message);
  await mkdir(directory, { recursive: true });
  const temp = path.join(directory, `${filename}.${randomUUID()}.tmp`);
  await writeFile(temp, JSON.stringify(result.session), { encoding: "utf8", mode: 0o600 });
  await rename(temp, file);
  console.log(result.reply);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}).finally(closeDatabase);
