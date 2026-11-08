/**
 * Pedidos que llegan en el enlace de apertura (por ejemplo, el botón «Tengo un antojo» del widget abre
 * /Bitacora/?urgencia=1). Se leen una sola vez y se limpia la dirección para que recargar no los repita.
 */
let urge = false;

if (typeof window !== 'undefined') {
  const params = new URLSearchParams(window.location.search);
  if (params.has('urgencia')) {
    urge = true;
    window.history.replaceState(null, '', window.location.pathname);
  }
}

/** true una sola vez si la app se abrió para el botón de urgencia. */
export function takeUrgeRequest(): boolean {
  const u = urge;
  urge = false;
  return u;
}
