const ALIAS = "/mx";

export function reroute(pathname: string): string | void {
  if (pathname === ALIAS) {
    return "/";
  }
  if (pathname.startsWith(`${ALIAS}/`)) {
    return pathname.slice(ALIAS.length);
  }
}

export function variants(pathname: string): string[] {
  return [pathname === "/" ? ALIAS : `${ALIAS}${pathname}`];
}
