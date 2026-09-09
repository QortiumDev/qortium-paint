import { describe, it, expect } from 'vitest';
import { readWorkspace, workspaceUrl } from './workspaceRoute';
import { sectionUrl } from './Reference';
describe('workspace links',()=>{
 it('canonicalizes aliases without losing hashes or repeated parameters',()=>{
  for(const alias of ['developer','developers','reference']) {
   const input=`https://example.test/render/APP/Paint/Paint?view=${alias}&future=a&future=b#drawing`;
   expect(readWorkspace(input)).toBe('developers');
   const next=workspaceUrl(input,'developers');expect(next.searchParams.get('view')).toBe('developers');expect(next.searchParams.getAll('future')).toEqual(['a','b']);expect(next.hash).toBe('#drawing');
   const paint=workspaceUrl(sectionUrl(next.href,'files'),'paint');expect(paint.searchParams.has('section')).toBe(false);expect(paint.hash).toBe('#drawing');
  }
 });
});
