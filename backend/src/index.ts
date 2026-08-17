import { assertValidConfig, config } from "./config.js";
import { createServer } from "./server.js";
import { logInfo } from "./logger.js";

assertValidConfig(config);

const app = createServer();

app.listen(config.port, () => {
  const mode = config.loginRequired ? "login required" : "workshop mode (no login)";
  logInfo(`Listening on :${config.port} (${mode})`);
});
