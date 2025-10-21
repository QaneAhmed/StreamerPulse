const fs = require('fs');
const path = 'scripts/twitch-ingest.ts';
let content = fs.readFileSync(path, 'utf8');
const target = "console.error(\"[ingestion] Failed to start session\", error);";
if (content.includes(target)) {
  content = content.replace(target, "console.error(\"[ingestion] Failed to start session\", { message: error?.message, data: error?.data, code: error?.code, stack: error instanceof Error ? error.stack : undefined });");
  fs.writeFileSync(path, content);
}
