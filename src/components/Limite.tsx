import { Component, type ReactNode } from 'react';

/**
 * Red bajo la lista. Un error al pintar una sola plaza tumba el árbol de
 * React entero, y como toda la página es una isla lo que queda es un blanco
 * absoluto: eso es justo lo que pasaba con las convocatorias que llegaban sin
 * organismo. El dato ya viene saneado, pero el origen puede inventarse otra
 * sorpresa mañana, y entonces conviene que se caiga la lista y no el sitio.
 *
 * Tiene que ser una clase: es lo único que React deja usar para esto.
 */
export class Limite extends Component<{ children: ReactNode }, { fallo: Error | null }> {
  state: { fallo: Error | null } = { fallo: null };

  static getDerivedStateFromError(fallo: Error) {
    return { fallo };
  }

  componentDidCatch(fallo: Error) {
    // Queda en la consola para quien vaya a mirar por qué.
    console.error('Convocatorias: fallo al pintar la lista', fallo);
  }

  render() {
    const { fallo } = this.state;
    if (!fallo) return this.props.children;

    return (
      <div className="rounded-xl border border-dashed border-line py-16 text-center">
        <p className="display mb-1.5 text-xl font-semibold">
          Algo se ha roto al pintar esta lista
        </p>
        <p className="mx-auto mb-4 max-w-[52ch] text-base text-ink-3">
          No es culpa tuya ni de lo que has filtrado. Vuelve a cargar la página; si sigue igual,
          los datos de origen traen algo que esta página todavía no sabe leer.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="hover:border-pine hover:text-pine rounded-lg border border-line px-4 py-2 text-base font-semibold text-ink-2 transition-colors"
        >
          Volver a cargar
        </button>
      </div>
    );
  }
}
