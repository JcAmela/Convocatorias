/**
 * El contrato de la API vive en la carpeta compartida: lo escribe la función
 * de Supabase y lo lee la web, así que un cambio de forma tiene que romper en
 * los dos lados a la vez o no sirve de nada.
 *
 * Este fichero se queda como reexportación para que los veinte sitios que
 * importan `./tipos` sigan funcionando.
 */
export * from '../../supabase/functions/_shared/tipos.ts';
