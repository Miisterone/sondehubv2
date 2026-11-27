import { useEffect, useState } from 'react';

const QUERY = '(max-width: 767px)';

export function useIsMobile() {
  const [m, setM] = useState(() => window.matchMedia(QUERY).matches);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}
