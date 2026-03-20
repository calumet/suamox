// This file contains server-only secrets that must NEVER appear in the client bundle.
// The e2e test searches for the marker string below.
export const DB_CONNECTION_STRING = "MARKER_SERVER_SECRET_DB_CONN_12345";
export const API_KEY = "MARKER_SERVER_SECRET_API_KEY_67890";

export function getServerOnlyData() {
  return {
    dbUrl: DB_CONNECTION_STRING,
    apiKey: API_KEY,
    timestamp: Date.now(),
  };
}
