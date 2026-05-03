export function shouldProxyApiRoute(): boolean {
  return Boolean(process.env.OPEN_LAGRANGE_API_URL);
}

export async function proxyApiRoute(request: Request): Promise<Response> {
  const apiUrl = process.env.OPEN_LAGRANGE_API_URL;
  if (!apiUrl) throw new Error("OPEN_LAGRANGE_API_URL is not configured.");
  const source = new URL(request.url);
  const pathname = source.pathname.startsWith("/v1/") ? `/api${source.pathname}` : source.pathname;
  const target = new URL(pathname, apiUrl);
  target.search = source.search;
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");
  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.arrayBuffer();
  const response = await fetch(target, init);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
