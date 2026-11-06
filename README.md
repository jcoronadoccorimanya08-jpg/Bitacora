# Bitácora

Registro diario **privado** para dejar hábitos, en ciclos de 90 días: racha, disparadores y un premio cada 7 días.
Funciona sin internet, se instala en el celular y guarda todo **cifrado** en el teléfono.

**Abrir la app:** https://jcoronadoccorimanya08-jpg.github.io/Bitacora/

## Instalarla en Android

1. Abre el link en **Chrome**.
2. Toca **Instalar** en el aviso que aparece abajo, o abre el menú **⋮ → Instalar aplicación**.
3. Ábrela desde el ícono **Bitácora** de tu pantalla de inicio.

## Cómo funciona

- Cada día marcas cada hábito como cumplido o como caída. Si caes, anotas **qué lo disparó** (estrés, cansancio, noche con el celular…).
- **Día limpio:** todos los hábitos cumplidos.
- **Racha que perdona:** una caída suelta no rompe la racha, solo no suma. Dos días seguidos sin día limpio la reinician.
- **Escalones:** cada 7 días de racha (7, 14, 21… hasta el 84) se habilita un premio que tú defines.
- **Análisis:** resumen de la semana, historial por hábito, disparadores más frecuentes y caídas por día de la semana.
- **Reporte para Claude:** un resumen en texto para pedir un análisis sin juicios. Incluye tus datos; compártelo solo si quieres.

## Privacidad

- **PIN obligatorio** (de 4 a 8 números) al abrir la app y al volver a ella.
- Los datos se cifran con **AES-GCM de 256 bits**, con una clave derivada de tu PIN mediante **PBKDF2-SHA256** (250 000 iteraciones). El PIN no se guarda en ninguna parte.
- No hay cuentas, servidores ni analítica, y el código no contiene datos de nadie. Tus hábitos se configuran en el teléfono.
- **Si olvidas el PIN, los datos no se pueden recuperar.** Haz respaldos: el archivo de respaldo también va cifrado con tu PIN.
- El PIN protege contra miradas curiosas y contra quien revise los archivos del teléfono. Un PIN de 6 dígitos o más resiste mucho mejor que uno de 4.

## Archivo de configuración (opcional)

Para no escribir todo a mano en el teléfono, la primera pantalla acepta un archivo `.json` como este:

```json
{
  "app": "bitacora",
  "kind": "config",
  "habits": [
    { "name": "Ejemplo", "q": "¿Día limpio?", "ok": "Limpio", "fail": "Caí", "phrase": "Una frase para el momento difícil" }
  ],
  "triggers": ["Estrés", "Cansancio"]
}
```

Ese archivo es personal: **no lo subas a este repositorio**.

## Desarrollo

Requiere Node 22.

```bash
npm ci
npm run dev       # servidor de desarrollo
npm test          # reglas, cifrado y respaldos (Vitest)
npm run e2e       # pruebas en un teléfono simulado (Playwright)
npm run check     # todo lo anterior + build
npm run icons     # regenerar los íconos
```

Cada `push` a `main` corre las pruebas y, si pasan, publica en GitHub Pages. La app instalada muestra el aviso **«Hay una versión nueva → Actualizar»**.

## Créditos

Tipografías [Barlow y Barlow Condensed](https://tribby.com/fonts/barlow/) (OFL). Íconos basados en [Lucide](https://lucide.dev) (ISC).
