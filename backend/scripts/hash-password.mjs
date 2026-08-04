#!/usr/bin/env node
import bcrypt from "bcryptjs";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const rl = createInterface({ input: stdin, output: stdout });
const password = await rl.question("Password for APP_PASSWORD_HASH: ");
rl.close();

if (!password) {
  console.error("Empty password - aborted.");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
console.log("\nAPP_PASSWORD_HASH=" + hash);
console.log("(add to .env, do NOT commit)\n");
