import { expect, it } from 'vitest';
import { optionalResourceJson } from '../../web/resource-json.ts';
it('treats absent optional catalogs and SPA HTML fallbacks as no external resources', async () => {
  expect(await optionalResourceJson(new Response('<!doctype html><title>flymrp</title>', { headers: { 'content-type': 'text/html' } }))).toBeNull();
  expect(await optionalResourceJson(new Response('not found', { status: 404 }))).toBeNull();
  expect(await optionalResourceJson(Response.json(['game/map.res']))).toEqual(['game/map.res']);
});
it('still reports malformed catalogs served as JSON', async () => {
  await expect(optionalResourceJson(new Response('{broken', { headers: { 'content-type': 'application/json' } }))).rejects.toThrow();
});
