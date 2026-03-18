export async function fetchWithDriverAuth(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.location.href = "/driver/login";
    throw new Error("Unauthorized");
  }
  return res;
}
