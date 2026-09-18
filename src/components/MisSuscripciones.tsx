import { useCallback, useEffect, useState } from 'react';
import {
  type Cadencia, type Suscripcion,
  borraSuscripcion, cierraSesion, misSuscripciones, pideEnlace, supabase,
} from '../lib/cuenta';
import { deQuery } from '../lib/filtros';
import { NIVEL_CORTO, ETIQUETA_AMBITO, URGENCIAS } from '../lib/formato';

/**
 * El perfil: qué búsquedas tienes guardadas y cada cuánto te llegan.
 *
 * Es la página a la que apunta cada correo, así que tiene que funcionar para
 * quien llega desde el móvil sin acordarse de nada. De ahí que se entre con
 * el mismo enlace por correo que en el alta y no haya contraseñas por medio.
 *
 * Los filtros se editan donde se pusieron —en el tablero— y no aquí: duplicar
 * esa barra de filtros en una segunda pantalla sería mantener dos veces lo
 * mismo, y ya sabemos cómo acaba eso en este proyecto.
 */

const CADENCIAS: { valor: Cadencia; texto: string }[] = [
  { valor: 'diaria', texto: 'Cada día' },
  { valor: 'semanal', texto: 'Una vez por semana' },
  { valor: 'mensual', texto: 'Una vez al mes' },
];

/** La query guardada, dicha en palabras. */
function enPalabras(filtros: string): string[] {
  const f = deQuery(filtros);
  const partes: string[] = [];
  if (f.q.trim()) partes.push(`«${f.q.trim()}»`);
  for (const n of f.niveles) partes.push(NIVEL_CORTO[n] ?? n);
  for (const c of f.contratos) partes.push(c === 'fija' ? 'Fija' : c === 'bolsa' ? 'Bolsa' : 'Temporal');
  for (const a of f.ambitos) partes.push(ETIQUETA_AMBITO[a] ?? a);
  for (const u of f.urgencias) partes.push(URGENCIAS.find((x) => x.valor === u)?.texto ?? u);
  if (f.lugares.length) partes.push(`${f.lugares.length} ${f.lugares.length === 1 ? 'lugar' : 'lugares'}`);
  if (f.soloCerca) partes.push('Solo cerca de casa');
  return partes;
}

export function MisSuscripciones() {
  const [cargando, setCargando] = useState(true);
  const [sesion, setSesion] = useState<{ id: string; email: string } | null>(null);
  const [lista, setLista] = useState<Suscripcion[]>([]);
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [fallo, setFallo] = useState<string | null>(null);

  const recarga = useCallback(async () => {
    try {
      setLista(await misSuscripciones());
    } catch (e) {
      setFallo((e as Error).message);
    }
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      const u = s?.user;
      setSesion(u?.email ? { id: u.id, email: u.email } : null);
      if (u) await recarga(); else setLista([]);
      setCargando(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [recarga]);

  const cambiaCadencia = async (id: string, cadencia: Cadencia) => {
    setFallo(null);
    const { error } = await supabase.from('convoca_suscripciones').update({ cadencia }).eq('id', id);
    if (error) setFallo(error.message); else await recarga();
  };

  const cambiaActiva = async (id: string, activa: boolean) => {
    setFallo(null);
    const { error } = await supabase.from('convoca_suscripciones').update({ activa }).eq('id', id);
    if (error) setFallo(error.message); else await recarga();
  };

  if (cargando) {
    return <p className="text-base text-ink-3">Un momento…</p>;
  }

  if (!sesion) {
    return (
      <div className="max-w-[34rem]">
        <p className="mb-4 text-base leading-relaxed text-ink-2">
          Escribe el correo con el que te diste de alta y te mandamos un enlace para entrar.
          Sin contraseñas.
        </p>
        {enviado ? (
          <p className="bg-pine-soft text-pine-ink rounded-lg px-3 py-2.5 text-base">
            Mira tu correo: te hemos mandado el enlace de acceso.
          </p>
        ) : (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setFallo(null);
              const err = await pideEnlace(email.trim(), { filtros: '', nombre: '', cadencia: 'diaria' });
              if (err) setFallo(err); else setEnviado(true);
            }}
          >
            <input
              id="acceso-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@correo.com"
              className="min-w-[14rem] flex-1 rounded-lg border border-line bg-surface px-3 py-2.5 text-base outline-none placeholder:text-ink-3 focus:border-pine"
            />
            <button
              type="submit"
              className="bg-pine rounded-lg px-4 py-2.5 text-base font-semibold text-white transition-opacity hover:opacity-90"
            >
              Mandarme el enlace
            </button>
          </form>
        )}
        {fallo && <p className="bg-rust-soft text-rust mt-3 rounded-lg px-3 py-2 text-base">{fallo}</p>}
      </div>
    );
  }

  return (
    <div>
      <p className="mb-5 text-base text-ink-3">
        Entraste como <strong className="text-ink-2">{sesion.email}</strong> ·{' '}
        <button
          type="button"
          onClick={async () => { await cierraSesion(); setLista([]); }}
          className="hover:text-ink underline underline-offset-2"
        >
          cerrar sesión
        </button>
      </p>

      {fallo && <p className="bg-rust-soft text-rust mb-4 rounded-lg px-3 py-2 text-base">{fallo}</p>}

      {lista.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line py-14 text-center">
          <p className="display mb-1.5 text-xl font-semibold">No tienes ninguna búsqueda guardada</p>
          <p className="mx-auto mb-4 max-w-[46ch] text-base text-ink-3">
            Ve al tablero, pon los filtros que te interesen y pulsa «Avísame por email».
            Si no pones ninguno, recibirás todo lo que salga en Cataluña.
          </p>
          <a
            href="/"
            className="hover:border-pine hover:text-pine inline-block rounded-lg border border-line px-4 py-2 text-base font-semibold text-ink-2 transition-colors"
          >
            Ir al tablero
          </a>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {lista.map((s) => {
            const palabras = enPalabras(s.filtros);
            return (
              <li key={s.id} className="rounded-xl border border-line bg-surface p-4">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="display text-lg font-semibold">{s.nombre}</h2>
                  {!s.activa && (
                    <span className="bg-surface-2 rounded-full px-2 py-0.5 text-2xs font-semibold text-ink-3">
                      En pausa
                    </span>
                  )}
                </div>

                <p className="mb-3 text-base text-ink-3">
                  {palabras.length
                    ? palabras.join(' · ')
                    : 'Sin filtros: todo lo que salga en Cataluña.'}
                </p>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`cadencia-${s.id}`}>Cada cuánto</label>
                  <select
                    id={`cadencia-${s.id}`}
                    value={s.cadencia}
                    onChange={(e) => cambiaCadencia(s.id, e.target.value as Cadencia)}
                    className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-base"
                  >
                    {CADENCIAS.map((c) => (
                      <option key={c.valor} value={c.valor}>{c.texto}</option>
                    ))}
                  </select>

                  <a
                    href={`/?${s.filtros}`}
                    className="hover:border-pine hover:text-pine rounded-lg border border-line px-2.5 py-1.5 text-base text-ink-2 transition-colors"
                  >
                    Ver y cambiar los filtros
                  </a>

                  <button
                    type="button"
                    onClick={() => cambiaActiva(s.id, !s.activa)}
                    className="hover:text-ink ml-auto text-sm text-ink-3 underline underline-offset-2"
                  >
                    {s.activa ? 'Pausar' : 'Reanudar'}
                  </button>
                  <button
                    type="button"
                    onClick={async () => { await borraSuscripcion(s.id); await recarga(); }}
                    className="hover:text-rust text-sm text-ink-3 underline underline-offset-2"
                  >
                    Borrar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
