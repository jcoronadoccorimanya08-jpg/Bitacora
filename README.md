# Bitácora

Registro diario **privado** para dejar hábitos, en ciclos de 90 días: racha, disparadores, **ahorro** y un premio o un cofre cada 7 días.
Funciona sin internet, se instala en el celular y guarda todo **cifrado** en el teléfono, protegido con **patrón y huella**.

**Abrir la app:** https://jcoronadoccorimanya08-jpg.github.io/Bitacora/

## Instalarla en Android

1. Abre el link en **Chrome** (no dentro de otra app).
2. Toca **Instalar** en la tarjeta verde, o abre el menú **⋮ → Instalar aplicación**.
3. Ábrela desde el ícono **Bitácora**. Si no está en la pantalla de inicio, búscala en tus aplicaciones.

## Cómo funciona

- Cada día marcas cada hábito como cumplido o como caída. Si caes, anotas **qué lo disparó** (estrés, cansancio, noche con el celular…).
- **Día limpio:** todos los hábitos cumplidos.
- **Racha que perdona:** una caída suelta no rompe la racha, solo no suma. Dos días seguidos sin día limpio la reinician.
- **Ahorro:** cada hábito puede sumar algo por día limpio: plata (Bs), horas recuperadas o días (por ejemplo, «mente clara»). El botón **«Dije no a una fiesta»** suma el monto que elijas.
- **Escalones:** cada 7 días de racha (7, 14, 21… hasta el 84). Los días con premio tienen nombre y **precio**, y se pagan con tu ahorro; los demás son **cofres sorpresa** (+20 o +50 Bs, un comodín o una noche de series). El día 84 trae un cofre doble.
- **Comodín:** sale de los cofres y salva un día malo para la racha.
- **Gran premio:** tu meta, siempre arriba en Hoy. Se reclama al final del ciclo (o en la fecha que elijas).
- **Semana victoriosa con Val Q:** si el promedio de las dos apps en la semana llega a 80 %, la semana es victoriosa. El gran premio puede pedir semanas victoriosas (`"weeks": 9` en la configuración). Las dos apps se pasan solo esos porcentajes, nunca tus hábitos.
- **Insignias cada 2 semanas:** Bronce, Plata, Oro, Platino, Diamante y Leyenda. Cada bloque de 2 semanas con 80 % limpio de promedio sube un nivel.
- **Ánimo del día:** un toque en Hoy; en Análisis ves cómo se relaciona con tus días limpios.
- **Historial de ciclos:** al empezar un ciclo nuevo, el resumen del anterior queda en Análisis.
- **Botón de urgencia:** cuando llega el antojo, muestra tu gran premio, tu frase y tu ahorro, y te acompaña 10 minutos respirando.
- **Análisis:** tu montaña (promedio de 7 días), semanas, lo que ganaste por hábito, historial, disparadores y caídas por día.
- **Apariencia:** tema automático, oscuro, **negro puro** o claro; cuatro colores y letra grande (Ajustes → Apariencia).
- **Cómo funciona:** todas las reglas, con tus números, en Ajustes → App.
- **Reporte:** una **imagen** para compartir (no muestra tus hábitos ni tus disparadores) y un texto para pedirle a Claude un análisis sin juicios.

## Privacidad

- **Patrón** al abrir la app y al volver a ella; con **huella** si tu teléfono lo permite (passkey con PRF).
- Los datos se cifran con **AES-GCM de 256 bits** usando una llave al azar. Esa llave se abre con tu patrón (**PBKDF2-SHA256**, 250 000 iteraciones) o con tu huella. El patrón no se guarda en ninguna parte.
- No hay cuentas, servidores ni analítica, y el código no contiene datos de nadie. Tus hábitos se configuran en el teléfono.
- **Si olvidas el patrón, los datos no se pueden recuperar.** Haz respaldos: Ajustes → Respaldo → *Guardar en Drive o compartir*, *Guardar en el celular* o *Copiar respaldo*. El respaldo es un `.txt` cifrado que se abre con tu patrón.

## Archivo de configuración (opcional)

Para no escribir todo a mano, la primera pantalla acepta un archivo `.txt` (o su texto pegado) como este:

```json
{
  "app": "bitacora",
  "kind": "config",
  "habits": [
    {
      "name": "Ejemplo",
      "q": "¿Día limpio?",
      "ok": "Limpio",
      "fail": "Caí",
      "phrase": "Una frase para el momento difícil",
      "value": { "kind": "bs", "amount": 10 }
    }
  ],
  "triggers": ["Estrés", "Cansancio"],
  "milestones": [{ "day": 7, "name": "Mi premio", "price": 100 }],
  "grand": { "name": "Mi gran premio", "price": 500, "weeks": 9 },
  "partyBonus": 0
}
```

`value.kind` puede ser `bs`, `horas` o `dias` (con `label`, el nombre del contador). Los escalones (`milestones`) van en días múltiplos de 7.
Ese archivo es personal: **no lo subas a este repositorio**.

## Desarrollo

Requiere Node 22.

```bash
npm ci
npm run dev       # servidor de desarrollo
npm test          # reglas, ahorro, premios, cifrado y respaldos (Vitest)
npm run e2e       # pruebas en un teléfono simulado (Playwright), incluida la huella simulada
npm run check     # todo lo anterior + build
npm run icons     # regenerar los íconos
```

Cada `push` a `main` corre las pruebas y, si pasan, publica en GitHub Pages. La app instalada muestra el aviso **«Hay una versión nueva → Actualizar»**.

### Estructura

| Ruta | Qué contiene |
| --- | --- |
| `src/lib/engine.ts` | Reglas: racha, día limpio, ahorro, montaña y semanas |
| `src/lib/rewards.ts` | Escalones, cofres, comodines, ahorro disponible y gran premio |
| `src/lib/crypto.ts`, `biometric.ts`, `vault.ts` | Cifrado, huella (passkeys) y bóveda local |
| `src/lib/store.ts` | Estado, bloqueo y acciones |
| `src/screens/` | Hoy, Premios, Análisis, Ajustes, configuración inicial y bloqueo |
| `tests/`, `e2e/` | Pruebas unitarias y en un Galaxy simulado |

## Créditos

Tipografías [Inter](https://rsms.me/inter/) y [Barlow Condensed](https://tribby.com/fonts/barlow/) (OFL). Íconos basados en [Lucide](https://lucide.dev) (ISC).
