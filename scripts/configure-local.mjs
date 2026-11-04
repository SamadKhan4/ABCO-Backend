import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env")) {
  writeFileSync(
    ".env",
    `PORT=4000\nHOST=127.0.0.1\nMONGODB_URI=mongodb://127.0.0.1:27017/abco_hrms\nSESSION_SECRET=${randomBytes(48).toString("hex")}\nDOCUMENT_KEY=${randomBytes(32).toString("hex")}\nFRONTEND_ORIGIN=http://127.0.0.1:5180\nNODE_ENV=development\n`,
  );
  console.log(
    "Created ignored .env with a random session secret. No administrator credentials were created.",
  );
} else console.log("Existing .env preserved.");
