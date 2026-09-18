import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type Cadencia, type Pendiente, type Suscripcion,
  borraSuscripcion, cierraSesion, guardaSuscripcion, misSuscripciones,
  pideEnlace, recogePendiente, supabase,
} from '../lib/cuenta';

/**
 * «Avísame por email»: guarda la búsqueda que hay en pantalla.
 *
 * La idea que sostiene esto es que no hay que inventar ningún lenguaje de
 * filtros. Lo que se guarda es la misma cadena que ya viaja en la URL del
 * tablero, así que lo que llegue al correo se calcula con el mismo código que
 * pintó la lista que se estaba mirando.
 *
 * El viaje por el enlace del correo se lleva por delante el estado de la
 * página, así que la búsqueda se aparca en el navegador antes de irse y se
 * recoge al volver.
 */

const CADENCIAS: { valor: Cadencia; texto: string }[] = [
  { valor: 'diaria', texto: 'Cada día' },
  { valor: 'semanal', texto: 'Una vez por semana' },
  { valor: 'mensual', texto: 'Una vez al mes' },
];

type Estado =
  | { fase: 'cerrado' }
  | { fase: 'formulario' }
  | { fase: 'enviando' }
  | { fase: 'revisa-el-correo'; email: string }
  | { fase: 'guardada' };

export function Avisame({ filtros, resumen }: { filtros: string; resumen: string }) {
  const [estado, setEstado] = useState<Estado>({ fase: 'cerrado' });
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [cadencia, setCadencia] = useState<Cadencia>('diaria');
  const [sesion, setSesion] = useState<{ id: string; email: string } | null>(null);
  const [misBusquedas, setMisBusquedas] = useState<Suscripcion[] | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  const recarga = useCallback(async () => {
    try {
      setMisBusquedas(await misSuscripciones());
    } catch (e) {
      setFallo((e as Error).message);
    }
  }, []);

  /* --- la sesión, y lo que quedó pendiente antes de ir al correo --------- */

  useEffect(() => {
    let vivo = true;
    const { data: sub } = supabase.auth.onAuthStateChange(async (_evento, s) => {
      if (!vivo) return;
      const usuario = s?.user;
      setSesion(usuario?.email ? { id: usuario.id, email: usuario.email } : null);
      if (!usuario) { setMisBusquedas(null); return; }

      // Se vuelve del correo: guardar lo que se estaba pidiendo.
      const p = recogePendiente();
      if (p) {
        try {
          await guardaSuscripcion(p, usuario.id);
          setEstado({ fase: 'guardada' });
        } catch (e) {
          setFallo((e as Error).message);
        }
      }
      await recarga();
    });
    return () => { vivo = false; sub.subscription.unsubscribe(); };
  }, [recarga]);

  /* --- cerrar con Escape y con un clic fuera ----------------------------- */

  useEffect(() => {
    if (estado.fase === 'cerrado') return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setEstado({ fase: 'cerrado' }); };
    const fuera = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setEstado({ fase: 'cerrado' });
    };
    document.addEventListener('keydown', esc);
    document.addEventListener('mousedown', fuera);
    return () => {
      document.removeEventListener('keydown', esc);
      document.removeEventListener('mousedown', fuera);
    };
  }, [estado.fase]);

  const pendiente = (): Pendiente => ({
    filtros,
    nombre: nombre.trim() || resumen || 'Mi búsqueda',
    cadencia,
  });

  const alEnviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setFallo(null);
    const p = pendiente();

    // Con sesión abierta no hace falta pasar por el correo.
    if (sesion) {
      setEstado({ fase: 'enviando' });
      try {
        await guardaSuscripcion(p, sesion.id);
        setEstado({ fase: 'guardada' });
        await recarga();
      } catch (err) {
        setFallo((err as Error).message);
        setEstado({ fase: 'formulario' });
      }
      return;
    }

    setEstado({ fase: 'enviando' });
    const error = await pideEnlace(email.trim(), p);
    if (error) {
      setFallo(error);
      setEstado({ fase: 'formulario' });
    } else {
      setEstado({ fase: 'revisa-el-correo', email: email.trim() });
    }
  };

  const campo = 'w-full rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-base outline-none placeholder:text-ink-3 focus:border-pine';

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setEstado(estado.fase === 'cerrado' ? { fase: 'formulario' } : { fase: 'cerrado' })}
        aria-expanded={estado.fase !== 'cerrado'}
        className="hover:border-pine/50 flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-2 text-sm font-medium whitespace-nowrap text-ink-2 transition-colors sm:px-3"
      >
        <svg viewBox="0 0 24 24" className="size-4 shrink-0" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="2.5" y="5" width="19" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Avísame por email
      </button>

      {estado.fase !== 'cerrado' && (
        <div
          ref={panel}
          className="scroll-fino absolute top-[calc(100%+6px)] right-0 z-40 max-h-[min(70vh,520px)] w-[min(320px,calc(100vw-1.5rem))] overflow-y-auto rounded-xl border border-line bg-surface p-3.5 shadow-alza-2"
        >
          {estado.fase === 'revisa-el-correo' ? (
            <>
              <p className="display mb-1.5 text-base font-semibold">Mira tu correo</p>
              <p className="text-sm leading-snug text-ink-3">
                Te hemos mandado un enlace a <strong className="text-ink-2">{estado.email}</strong>.
                Púlsalo y la búsqueda se guarda sola. Puedes cerrar esto.
              </p>
            </>
          ) : estado.fase === 'guardada' ? (
            <>
              <p className="display mb-1.5 text-base font-semibold">Búsqueda guardada</p>
              <p className="mb-3 text-sm leading-snug text-ink-3">
                Te avisaremos cuando salga algo nuevo que encaje. Solo se manda si hay novedades.
              </p>
              <button
                type="button"
                onClick={() => setEstado({ fase: 'formulario' })}
                className="hover:text-ink text-sm font-semibold text-ink-3 underline underline-offset-2"
              >
                Ver mis búsquedas
              </button>
            </>
          ) : (
            <form onSubmit={alEnviar}>
              <p className="display mb-1 text-base font-semibold">Avísame de lo nuevo</p>
              <p className="mb-3 text-sm leading-snug text-ink-3">
                Guarda los filtros que tienes puestos ahora y te llegan por correo las
                convocatorias nuevas que encajen.
              </p>

              <label className="mb-1 block text-2xs font-bold tracking-[0.07em] text-ink-3 uppercase">
                Cómo la llamas
              </label>
              <input
                id="avisame-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder={resumen || 'Mi búsqueda'}
                className={`${campo} mb-3`}
              />

              <label className="mb-1 block text-2xs font-bold tracking-[0.07em] text-ink-3 uppercase">
                Cada cuánto
              </label>
              <div className="mb-3 flex flex-col gap-1">
                {CADENCIAS.map((c) => (
                  <label key={c.valor} className="hover:bg-surface-2 flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-base">
                    <input
                      type="radio"
                      name="avisame-cadencia"
                      checked={cadencia === c.valor}
                      onChange={() => setCadencia(c.valor)}
                      className="accent-pine"
                    />
                    {c.texto}
                  </label>
                ))}
              </div>

              {!sesion && (
                <>
                  <label htmlFor="avisame-email" className="mb-1 block text-2xs font-bold tracking-[0.07em] text-ink-3 uppercase">
                    Tu correo
                  </label>
                  <input
                    id="avisame-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.com"
                    className={`${campo} mb-1.5`}
                  />
                  <p className="mb-3 text-2xs leading-snug text-ink-3">
                    Te mandamos un enlace para confirmar que es tuyo. Sin contraseñas.
                  </p>
                </>
              )}

              {fallo && (
                <p className="bg-rust-soft text-rust mb-3 rounded-lg px-2.5 py-2 text-sm">{fallo}</p>
              )}

              <button
                type="submit"
                disabled={estado.fase === 'enviando'}
                className="bg-pine w-full rounded-lg py-2.5 text-base font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {estado.fase === 'enviando' ? 'Un momento…' : sesion ? 'Guardar la búsqueda' : 'Mandarme el enlace'}
              </button>

              {sesion && (
                <div className="mt-3 border-t border-line-soft pt-3">
                  <p className="mb-2 text-2xs text-ink-3">
                    Entraste como <strong className="text-ink-2">{sesion.email}</strong>
                  </p>
                  {misBusquedas?.length ? (
                    <ul className="mb-2 flex flex-col gap-1.5">
                      {misBusquedas.map((s) => (
                        <li key={s.id} className="flex items-start justify-between gap-2 text-sm">
                          <span className="min-w-0">
                            <span className="block truncate text-ink-2">{s.nombre}</span>
                            <span className="text-2xs text-ink-3">
                              {CADENCIAS.find((c) => c.valor === s.cadencia)?.texto}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={async () => { await borraSuscripcion(s.id); await recarga(); }}
                            className="hover:text-rust shrink-0 text-2xs text-ink-3 underline underline-offset-2"
                          >
                            Quitar
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mb-2 text-sm text-ink-3">Todavía no tienes ninguna guardada.</p>
                  )}
                  <button
                    type="button"
                    onClick={async () => { await cierraSesion(); setEstado({ fase: 'cerrado' }); }}
                    className="hover:text-ink text-2xs text-ink-3 underline underline-offset-2"
                  >
                    Cerrar sesión
                  </button>
                </div>
              )}
            </form>
          )}
        </div>
      )}
    </div>
  );
}
