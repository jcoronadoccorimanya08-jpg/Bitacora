# Bitácora — guía para Claude

PWA privada para dejar hábitos (ciclo de 90 días, racha, disparadores y premios cada 7 días). Se usa en un Android, instalada desde Chrome.
Es independiente de cualquier otra app: no compartas código en tiempo de ejecución ni datos.

## Privacidad: reglas que no se rompen

- **El repositorio y el sitio publicado son públicos.** Nunca pongas en el código, en los commits ni en los issues datos de la persona: sus hábitos, frases, disparadores propios, nombre, horarios ni respaldos.
- Lo personal entra a la app **solo desde el teléfono**: configuración a mano o un archivo `config` que nunca se sube al repositorio (`.gitignore` bloquea los nombres habituales).
- Los datos se guardan **solo cifrados** (`src/lib/crypto.ts` y `src/lib/vault.ts`): AES-GCM con clave PBKDF2 derivada del PIN. Nunca guardes el PIN ni datos en texto plano. La única preferencia sin cifrar es el tema (`bitacora.theme`).
- Sin analítica, sin servidores y sin librerías que se conecten a internet.

## Reglas del producto

- Interfaz en **español de Bolivia**, con tono directo y respetuoso. **Sin culpa**: una caída es información (se anota el disparador), no un fracaso.
- Día limpio = todos los hábitos en "ok". Una caída suelta no rompe la racha; dos días seguidos sin día limpio la reinician; hoy incompleto y sin caídas todavía no cuenta.
- Escalones cada 7 días de racha (`STEP`), con premio cuando la **mejor** racha llega a 7·k. Ciclo de 90 días.
- Fechas siempre en `America/La_Paz` (`src/lib/dates.ts`).
- Marcar un día completo debe tomar menos de 30 segundos; los botones miden 48 px o más.

## Reglas técnicas

- Toda la lógica vive en `src/lib/engine.ts` como funciones puras, con pruebas en `tests/engine.test.ts`. Si cambias una regla, actualiza la prueba.
- El estado tiene `schema: 1`. Si cambias el formato, sube `schema` y migra en `src/lib/sanitize.ts`. Nunca pierdas datos.
- Antes de entregar: `npm run check`.
