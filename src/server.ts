import { app } from "./app.js";
import { env } from "./config/env.js";
import { errorHandler } from "./middlewares/error.middleware.js";

app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`Logitec WMS API listening on port ${env.PORT}`);
});
