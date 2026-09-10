export type PaintWorkspace = 'paint' | 'developers';
const aliases = ['developers', 'developer', 'reference'];
export function readWorkspace(input: string | URL): PaintWorkspace {
  const url = new URL(input, 'http://localhost');
  return aliases.includes(url.searchParams.get('view') ?? '') ? 'developers' : 'paint';
}
export function workspaceUrl(input: string | URL, view: PaintWorkspace): URL {
  const url = new URL(input, 'http://localhost');
  if (view === 'developers') url.searchParams.set('view', 'developers');
  else { url.searchParams.delete('view'); url.searchParams.delete('section'); }
  return url;
}
