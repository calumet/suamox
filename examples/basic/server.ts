import { createServer } from "@calumet/suamox-hono-adapter";

const port = Number(process.env.PORT) || 3000;

await createServer({
  port,
});
