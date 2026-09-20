import { react } from "@calumet/elise-linter/oxlint";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [react],
  // El template no es codigo de este proyecto: son placeholders que create-app
  // sustituye al copiarlo.
  ignorePatterns: ["packages/create-app/template"],
});
