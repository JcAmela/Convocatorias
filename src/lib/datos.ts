import type { Tablero } from './tipos';

export const API = 'https://tytcebxazuprhzyzntyy.supabase.co/functions/v1/convoca-board';

/** Tablero vacío, para cuando la API no contesta durante el build. */
export function tableroVacio(motivo: string): Tablero {
  const hoy = new Date().toISOString().slice(0, 10);
  return {
    generado: new Date().toISOString(),
    hoy,
    abiertas: [],
    pendientes: [],
    cerradas: [],
    resumen: { abiertas: 0, pendientes: 0, cerradas: 0, plazas: 0, fijas: 0, temporales: 0, cierranEn7Dias: 0 },
    errores: [motivo],
  };
}

/**
 * Lee el tablero durante el build para que la página pinte contenido real en
 * el primer frame. El navegador vuelve a pedirlo al montar, así que un fallo
 * aquí degrada la primera pintada pero no rompe el sitio: nunca tumbamos el
 * build por una API que hoy no contesta.
 */
export async function leeTablero(): Promise<Tablero> {
  try {
    const res = await fetch(API, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return tableroVacio(`La API respondió ${res.status} durante el build`);
    return (await res.json()) as Tablero;
  } catch (err) {
    const motivo = err instanceof Error ? err.message : String(err);
    return tableroVacio(`No se pudo leer la API durante el build: ${motivo}`);
  }
}
