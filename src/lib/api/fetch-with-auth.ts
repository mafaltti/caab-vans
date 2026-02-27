export async function fetchWithAuth(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.location.href = "/admin/login";
    return new Promise(() => {});
  }
  return res;
}
