import { useEffect, useState } from 'react';
import { Icono } from './piezas';

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
      className="toque-amplio hover:border-pine hover:text-pine relative grid size-8 place-items-center rounded-md border border-line text-ink-3 pulsa"
    >
      {modo === 'oscuro' ? (
        <Icono nombre="luna" />
      ) : modo === 'claro' ? (
        <Icono nombre="sol" />
      ) : (
        <Icono nombre="pantalla" />
      )}
    </button>
  );
}
