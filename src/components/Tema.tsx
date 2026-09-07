import { useEffect, useState } from 'react';

type Modo = 'claro' | 'oscuro' | 'sistema';

const CLAVE = 'convocatorias:tema';

/**
 * Tres estados, no dos: "sistema" es el valor por defecto y no estampa nada
 * en el `<html>`, así que la página sigue al sistema operativo hasta que
 * alguien elige de verdad. El script de `Base.astro` aplica lo guardado antes
 * de la primera pintada para que no haya fogonazo blanco.
 */
export function Tema() {
  const [modo, setModo] = useState<Modo>('sistema');

  useEffect(() => {
    const guardado = localStorage.getItem(CLAVE) as Modo | null;
    if (guardado === 'claro' || guardado === 'oscuro') setModo(guardado);
  }, []);

  const cambia = (nuevo: Modo) => {
    setModo(nuevo);
    const raiz = document.documentElement;
    try {
      if (nuevo === 'sistema') {
        localStorage.removeItem(CLAVE);
        raiz.removeAttribute('data-theme');
      } else {
        localStorage.setItem(CLAVE, nuevo);
        raiz.setAttribute('data-theme', nuevo === 'oscuro' ? 'dark' : 'light');
      }
    } catch {
      // Sin almacenamiento el cambio vale solo para esta visita.
    }
  };

  const siguiente: Record<Modo, Modo> = { sistema: 'claro', claro: 'oscuro', oscuro: 'sistema' };
  const etiqueta: Record<Modo, string> = {
    sistema: 'Tema: el del sistema',
    claro: 'Tema: claro',
    oscuro: 'Tema: oscuro',
  };

  return (
    <button
      type="button"
      onClick={() => cambia(siguiente[modo])}
      title={etiqueta[modo]}
      aria-label={`${etiqueta[modo]}. Pulsa para cambiar.`}
      className="hover:border-pine hover:text-pine grid size-8 place-items-center rounded-lg border border-line text-ink-3 transition-colors"
    >
      {modo === 'oscuro' ? (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" strokeLinejoin="round" />
        </svg>
      ) : modo === 'claro' ? (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" strokeLinecap="round" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="2.5" y="4.5" width="19" height="13" rx="2" />
          <path d="M8 20.5h8" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
