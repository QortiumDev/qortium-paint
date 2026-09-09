import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import App from './App';
import { getDisplaySettingsUpdateFromMessage, getInitialDisplaySettings } from './displaySettings';
const spies=vi.hoisted(()=>({destroy:vi.fn(),tool:vi.fn(),undo:vi.fn(),import:vi.fn(),create:vi.fn()}));
vi.mock('./engine/engine',async original=>({...await original<typeof import('./engine/engine')>(),createPaintEngine:()=>{spies.create();return {subscribe:(fn:Function)=>{fn({canUndo:true,canRedo:false,canvasSize:{width:1024,height:768},dirty:false,floatingImage:false,tool:'brush',zoom:1});return()=>{}},onColorPick:()=>()=>{},onTextRequest:()=>()=>{},onPan:()=>()=>{},onCursorMove:()=>()=>{},destroy:spies.destroy,setTool:spies.tool,undo:spies.undo,importImage:spies.import}}}));
vi.mock('./qdn/api',async original=>({...await original<typeof import('./qdn/api')>(),qdnServices:{getBridgeState:async()=>({actions:[],bridged:false,publicNode:false})}}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root:ReturnType<typeof createRoot>|undefined;
afterEach(async()=>{await act(async()=>root?.unmount());document.body.innerHTML='';history.replaceState(null,'','/');vi.unstubAllGlobals();vi.clearAllMocks()});
async function mount(url='/'){history.replaceState({host:'kept'},'',url);const node=document.createElement('div');document.body.append(node);root=createRoot(node);await act(async()=>root!.render(<App/>));}
async function tab(n:number){await act(async()=>(document.querySelectorAll('.qp-workspace-tabs button')[n] as HTMLButtonElement).click())}
it('retains engine, dialog drafts, query and hash; ignores hidden editor hotkeys',async()=>{
 await mount('/?future=a&future=b#drawing');const canvas=document.querySelector('canvas');
 await act(async()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'s',ctrlKey:true,bubbles:true})));
 expect(document.querySelector('[role=dialog]')).not.toBeNull();
 await tab(1);expect(document.querySelector('.qp-editor')?.hasAttribute('hidden')).toBe(true);
 await act(async()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'b'}));window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true}));window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));});
 expect(spies.tool).not.toHaveBeenCalled();expect(spies.undo).not.toHaveBeenCalled();
 await tab(0);expect(document.querySelector('canvas')).toBe(canvas);expect(document.querySelector('[role=dialog]')).not.toBeNull();expect(spies.create).toHaveBeenCalledTimes(1);expect(spies.destroy).not.toHaveBeenCalled();expect(history.state).toEqual({host:'kept'});expect(location.hash).toBe('#drawing');expect(new URL(location.href).searchParams.getAll('future')).toEqual(['a','b']);
});
it('normalizes reference aliases and restores workspace on browser history events',async()=>{
 await mount('/?view=reference&section=files#drawing');expect(new URL(location.href).searchParams.get('view')).toBe('developers');expect(document.querySelector('.qp-reference')?.getAttribute('lang')).toBe('en');
 history.replaceState(history.state,'','/#drawing');await act(async()=>window.dispatchEvent(new PopStateEvent('popstate')));expect(document.querySelector('.qp-reference')).toBeNull();
});
it('restores canonical paint and reference section entries across back-forward navigation',async()=>{
 await mount('/?future=a&future=b#drawing');
 await tab(1);
 expect(location.search).toBe('?future=a&future=b&view=developers');
 const files=document.querySelector('a[href*="section=files"]') as HTMLAnchorElement;
 await act(async()=>files.click());
 expect(location.search).toBe('?future=a&future=b&view=developers&section=files');
 expect(document.activeElement?.id).toBe('reference-files');

 history.replaceState(history.state,'','/?future=a&future=b#drawing');
 await act(async()=>window.dispatchEvent(new PopStateEvent('popstate')));
 expect(document.querySelector('.qp-reference')).toBeNull();
 history.replaceState(history.state,'','/?future=a&future=b&view=developers&section=files#drawing');
 await act(async()=>window.dispatchEvent(new PopStateEvent('popstate')));
 expect(document.querySelector('.qp-reference')).not.toBeNull();
 expect(new URL(location.href).searchParams.get('section')).toBe('files');
});
it('accepts clay and Home style snapshots while rejecting malformed styles',()=>{
 history.replaceState(null,'','/?accent=clay&uiStyle=fun');const state=getInitialDisplaySettings();expect(state).toMatchObject({accent:'clay',uiStyle:'fun'});expect(getDisplaySettingsUpdateFromMessage({action:'DISPLAY_SETTINGS_CHANGED',ui:'modern'},state)?.uiStyle).toBe('modern');expect(getDisplaySettingsUpdateFromMessage({action:'UI_STYLE_CHANGED',uiStyle:'bad'},state)).toBeNull();
});
it('renders public reference bounds from shared constants without publishing',async()=>{
 await mount('/?view=developers');
 expect(document.querySelector('.qp-reference')?.textContent).toContain('5,242,880');
 expect(document.querySelector('.qp-reference')?.textContent).toContain('33,554,432');
 const before=spies.import.mock.calls.length;
 const paste=new Event('paste');Object.defineProperty(paste,'clipboardData',{value:{items:[{kind:'file',type:'image/png',getAsFile:()=>new File(['x'],'test.png',{type:'image/png'})}]}});
 await act(async()=>window.dispatchEvent(paste));expect(spies.import).toHaveBeenCalledTimes(before);
});
it('reports reference copy success and clipboard failure',async()=>{
 const writeText=vi.fn().mockResolvedValue(undefined);
 vi.stubGlobal('navigator',{clipboard:{writeText}});
 await mount('/?view=developers&section=examples');
 const button=()=>document.querySelector('button[aria-label="Copy capabilities example"]') as HTMLButtonElement;
 await act(async()=>button().click());
 expect(writeText).toHaveBeenCalledWith(expect.stringContaining('SHOW_ACTIONS'));
 expect(document.querySelector('.copy-status')?.textContent).toBe('Copied capabilities example.');

 vi.stubGlobal('navigator',{clipboard:{writeText:vi.fn().mockRejectedValue(new Error('blocked'))}});
 await act(async()=>button().click());
 expect(document.querySelector('.copy-status')?.textContent).toBe('Clipboard unavailable. Select the code and copy it manually.');
});
