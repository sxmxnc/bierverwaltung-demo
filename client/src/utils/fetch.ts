/* Autor: Marius Middrup (FH Münster) */

export async function fetchWithAuth(input: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(input, { ...init, credentials: 'include' });
  if (res.status === 401) {
    window.location.href = '/login';
  }
  return res;
}
