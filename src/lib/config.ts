export function optionalEnv(name: string) {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export function env(name: string) {
  const value = optionalEnv(name);
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

export function appUrlFromRequest(request?: Request) {
  const configured = optionalEnv("NEXT_PUBLIC_APP_URL");
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (!request) {
    return "http://localhost:3000";
  }

  const forwardedProto = request.headers.get("x-forwarded-proto") ?? "http";
  const forwardedHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!forwardedHost) {
    return "http://localhost:3000";
  }

  return `${forwardedProto}://${forwardedHost}`;
}
