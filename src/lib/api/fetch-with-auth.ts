export async function fetchWithAuth(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    window.location.href = "/admin/login";
    // Throw so callers' .catch()/.finally() still run (e.g. setLoading(false))
    throw new Error("Unauthorized");
  }
  return res;
}
