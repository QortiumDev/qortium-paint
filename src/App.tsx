import { useEffect, useState } from 'react';
import { PaintApp } from './ui/PaintApp';
import { qdnServices } from './qdn/api';
import { Reference } from './Reference';
import { readWorkspace, workspaceUrl, type PaintWorkspace } from './workspaceRoute';

export default function App() {
  const [view, setView] = useState(() => readWorkspace(location.href));
  useEffect(() => {
    if (readWorkspace(location.href) === 'developers') history.replaceState(history.state, '', workspaceUrl(location.href, 'developers'));
    const restore = () => setView(readWorkspace(location.href));
    addEventListener('popstate', restore);
    return () => removeEventListener('popstate', restore);
  }, []);
  function visit(next: PaintWorkspace) {
    const url = workspaceUrl(location.href, next);
    if (url.href !== location.href) history.pushState(history.state, '', url);
    setView(next);
  }
  return <div className="qp-workspace">
    <nav className="qp-workspace-tabs" aria-label="Paint workspaces">
      <button className="qp-btn" aria-pressed={view === 'paint'} onClick={() => visit('paint')}>Paint</button>
      <button className="qp-btn" aria-pressed={view === 'developers'} onClick={() => visit('developers')}>Developers</button>
    </nav>
    <div className="qp-editor" hidden={view !== 'paint'}><PaintApp qdn={qdnServices} active={view === 'paint'} /></div>
    {view === 'developers' && <Reference />}
  </div>;
}
