import { startRouter } from "@calumet/suamox-router";
import { routes } from "virtual:pages";

import { setRouter } from "./lib/router";
import "./styles/global.css";

void startRouter({ routes }).then(setRouter);
