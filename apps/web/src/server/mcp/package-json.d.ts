// The root package.json, for the server version (resolveJsonModule is off in this app).
declare module "*/package.json" {
  export const version: string;
}
