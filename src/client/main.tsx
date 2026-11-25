import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { useCareLoop } from './useCareLoop';
import { Demo } from './components/Demo';
import { Kitchen } from './components/Kitchen';
import { Nurse } from './components/Nurse';
import { Resident } from './components/Resident';

function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash.replace(/^#\/?/, '').split('/');
}

function App() {
  const api = useCareLoop();
  const [page, arg] = useRoute();
  const embedded = window.self !== window.top;
  const solo = page === 'kitchen' || page === 'nurse' || page === 'resident';

  useEffect(() => {
    document.documentElement.classList.toggle('in-frame', embedded);
    document.body.classList.toggle('solo-body', solo);
  }, [embedded, solo]);

  if (page === 'kitchen') return <div className="solo"><Kitchen api={api} /></div>;
  if (page === 'nurse') return <div className="solo"><Nurse api={api} /></div>;
  if (page === 'resident') return <div className="solo"><Resident key={arg} api={api} residentId={arg ?? 'molly'} /></div>;
  return <Demo api={api} />;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
