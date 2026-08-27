const fs = require('fs');
let code = fs.readFileSync('src/lib/firebase.ts', 'utf8');

code = code.replace(
  'console.error("Error loading conversations:", error);',
  'if (error?.code !== "auth/admin-restricted-operation" && !String(error?.message).includes("Anonymous Auth is disabled")) { console.error("Error loading conversations:", error); }'
);
code = code.replace(
  'console.error("Error saving conversation:", error);',
  'if (error?.code !== "auth/admin-restricted-operation" && !String(error?.message).includes("Anonymous Auth is disabled")) { console.error("Error saving conversation:", error); }'
);
fs.writeFileSync('src/lib/firebase.ts', code);
