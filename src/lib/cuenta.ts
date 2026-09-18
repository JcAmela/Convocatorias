import { createClient, type Session } from '@supabase/supabase-js';

/**
 * La cuenta y las búsquedas guardadas.
 *
 * La clave que va aquí es la pública: está pensada para viajar en el
 * navegador y no abre nada por sí sola. Lo que protege los datos es la
 * política de la tabla —cada uno solo ve las suyas—, no esconder la clave.
 */

const URL_SUPABASE = 'https://tytcebxazuprhzyzntyy.supabase.co';
const CLAVE_PUBLICA = 'sb_publishable_FlAUQhKdvYCe2iAFu8oa7g_R2YQcL5a';

export const supabase = createClient(URL_SUPABASE, CLAVE_PUBLICA, {
  auth: {
    // Al volver del enlace del correo, la sesión viene en el fragmento de la
    // URL. Que la recoja el cliente y limpie la barra de direcciones.
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Los filtros con los que se pulsó «avísame», guardados mientras el visitante
 * va al correo y vuelve. Sin esto, el viaje de ida y vuelta por el enlace
 * mágico se lleva por delante lo que estaba mirando.
 */
const PENDIENTE = 'convocatorias:suscripcion-pendiente';

export interface Pendiente {
  filtros: string;
  nombre: string;
  cadencia: Cadencia;
}

export type Cadencia = 'diaria' | 'semanal' | 'mensual';

export function guardaPendiente(p: Pendiente): void {
  try {
    localStorage.setItem(PENDIENTE, JSON.stringify(p));
  } catch {
    // Sin almacenamiento se pierde el borrador; el alta se puede repetir.
  }
}

export function recogePendiente(): Pendiente | null {
  try {
    const crudo = localStorage.getItem(PENDIENTE);
    if (!crudo) return null;
    localStorage.removeItem(PENDIENTE);
    const p = JSON.parse(crudo) as Pendiente;
    return typeof p?.filtros === 'string' ? p : null;
  } catch {
    return null;
  }
}

export interface Suscripcion {
  id: string;
  nombre: string;
  filtros: string;
  cadencia: Cadencia;
  activa: boolean;
  confirmada_en: string | null;
  creada_en: string;
}

/** Manda el enlace de acceso y deja anotado a qué volver. */
export async function pideEnlace(email: string, pendiente: Pendiente): Promise<string | null> {
  guardaPendiente(pendiente);
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  });
  return error?.message ?? null;
}

export async function sesionActual(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function misSuscripciones(): Promise<Suscripcion[]> {
  const { data, error } = await supabase
    .from('convoca_suscripciones')
    .select('id, nombre, filtros, cadencia, activa, confirmada_en, creada_en')
    .order('creada_en', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Suscripcion[];
}

/**
 * Guarda la búsqueda. Se marca confirmada en el momento porque a estas
 * alturas el visitante ya ha demostrado que el correo es suyo: ha tenido que
 * abrirlo y pulsar el enlace para llegar hasta aquí.
 */
export async function guardaSuscripcion(p: Pendiente, usuarioId: string): Promise<void> {
  const { error } = await supabase.from('convoca_suscripciones').insert({
    usuario_id: usuarioId,
    nombre: p.nombre,
    filtros: p.filtros,
    cadencia: p.cadencia,
    confirmada_en: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

export async function borraSuscripcion(id: string): Promise<void> {
  const { error } = await supabase.from('convoca_suscripciones').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function cierraSesion(): Promise<void> {
  await supabase.auth.signOut();
}
