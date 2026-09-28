export function sessionToken(): string {
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const token = fragment.get("token");
  if (token) {
    sessionStorage.setItem("codemap-token", token);
    history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  }
  return sessionStorage.getItem("codemap-token") ?? "";
}

export async function reviewApi<T>(
  route: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api/review" + route, {
    ...options,
    headers: { ...options.headers, Authorization: `Bearer ${sessionToken()}` },
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.message === "string"
        ? data.message
        : "Review request failed.",
    );
  return data as T;
}
