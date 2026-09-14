/** Optional resource catalogs may be absent. SPA hosts (including Vite) can
 * answer a missing .json URL with the HTML application shell and status 200.
 */
export async function optionalResourceJson(response: Response): Promise<unknown | null> {
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null;
  return response.json();
}
