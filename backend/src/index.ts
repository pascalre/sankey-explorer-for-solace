import { assertValidConfig, config } from "./config.js";
import { createServer } from "./server.js";

assertValidConfig(config);

const app = createServer();

app.listen(config.port, () => {
  const mode = config.loginRequired ? "login required" : "workshop mode (no login)";
  console.log(`Listening on :${config.port} (${mode})`);
});
