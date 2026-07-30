import { PaintApp } from './ui/PaintApp';
import { qdnServices } from './qdn/api';

export default function App() {
  return <PaintApp qdn={qdnServices} />;
}
