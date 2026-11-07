# Bitácora — guía para Claude

PWA privada para dejar hábitos (ciclo de 90 días, racha, disparadores, ahorro y premios cada 7 días). Se usa en un Android, instalada desde Chrome.
Es independiente de cualquier otra app: no compartas código en tiempo de ejecución ni datos. Única excepción acordada: los porcentajes semanales de la semana victoriosa con Val Q (ver abajo).

## Privacidad: reglas que no se rompen

- **El repositorio y el sitio publicado son públicos.** Nunca pongas en el código, en los commits ni en los issues datos de la persona: sus hábitos, frases, disparadores propios, montos, premios, nombre, horarios ni respaldos.
- Lo personal entra a la app **solo desde el teléfono**: configuración a mano o un archivo `config` que nunca se sube al repositorio (`.gitignore` bloquea los nombres habituales).
- Los datos se guardan **solo cifrados** (`src/lib/vault.ts`): una llave de datos al azar (AES-GCM), envuelta por el patrón (PBKDF2) y opcionalmente por la huella (passkey con PRF). Nunca guardes el patrón ni datos en texto plano. Las únicas preferencias sin cifrar son el tema y la apariencia (`bitacora.theme`, `bitacora.look`: color y tamaño de letra), el aviso de instalación (`bitacora.install-hint`) el aviso de huella (`bitacora.bio-promo`) y la última versión vista (`bitacora.seen-version`, para «Novedades»); ninguna dice nada de la persona. Para la semana victoriosa, cada app publica **solo números** (el porcentaje de cada semana, por fecha) en `bitacora.semanas` y lee `val-quirurgico.semanas`: nunca nombres de hábitos, disparadores ni montos.
- La imagen del reporte no muestra nombres de hábitos ni disparadores.
- Sin analítica, sin servidores y sin librerías que se conecten a internet.

## Reglas del producto

- Interfaz en **español de Bolivia**, con tono directo y respetuoso. **Sin culpa**: una caída es información (se anota el disparador), no un fracaso.
- Día limpio = todos los hábitos en "ok" (o un comodín). Una caída suelta no rompe la racha; dos días seguidos sin día limpio la reinician; hoy incompleto y sin caídas todavía no cuenta.
- Escalones cada 7 días de racha (`STEP`), ganados con la **mejor** racha. Con premio en `settings.milestones` (nombre y precio, pagado con el ahorro); si no, cofre (el último, doble). Ciclo de 90 días.
- Ahorro: cada día "ok" suma el `value` del hábito (Bs, horas o días); «Dije no a una fiesta» suma `partyBonus`. Una caída no resta.
- Gran premio (`settings.grand`): se reclama desde su fecha o desde el último día del ciclo y, si tiene `weeks`, con esas semanas victoriosas (`src/lib/team.ts`: promedio de Bitácora y Val Q de 80 % o más).
- **Insignias** (`src/lib/badges.ts`): cada bloque de 2 semanas con 80 % limpio de promedio sube un nivel (Bronce, Plata, Oro, Platino, Diamante, Leyenda). Un bloque perdido no quita nada.
- **Ánimo del día** (`DayRecord.mood`, 1 a 5): un toque en Hoy; en Análisis se ve tu porcentaje limpio según tu ánimo.
- **Historial** (`history`, `src/lib/history.ts`): al empezar un ciclo nuevo se guarda un resumen del que termina; se ve en Análisis → Ciclos anteriores.
- Sin botones de borrar datos (pedido de la persona); la única salida es «¿Olvidaste tu patrón?».
- Fechas siempre en `America/La_Paz` (`src/lib/dates.ts`).
- Marcar un día completo debe tomar menos de 30 segundos; los botones miden 48 px o más.

## Reglas técnicas

- La lógica vive en `src/lib/engine.ts` y `src/lib/rewards.ts` como funciones puras, con pruebas en `tests/`. Si cambias una regla, actualiza la prueba.
- El estado tiene `schema: 2`, validado en `src/lib/sanitize.ts`. Si cambias el formato, sube `schema` y migra. Un campo nuevo opcional con valor por defecto en `sanitize.ts` (como `grand.weeks`) no lo cambia. Nunca pierdas datos.
- Respaldo: archivo `.txt` (Chrome Android no comparte `.json`), con opciones de compartir, guardar y copiar.
- Estilos: usa los tokens de `src/styles/app.css`.
- Antes de entregar: `npm run check`.
