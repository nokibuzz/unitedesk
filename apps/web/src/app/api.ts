export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  if (import.meta.env.MODE === 'demo') {
    const { demoResponse } = await import('../demo/api');
    return demoResponse(input, init);
  }
  return fetch(input, init);
}
