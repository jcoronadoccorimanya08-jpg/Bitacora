import { addDays, formatLong, type ISODate } from '../lib/dates';
import { exitTest, setTestDate } from '../lib/store';
import { Icon } from './Icon';

/** Aviso fijo del modo prueba: mueve la fecha simulada o sal para volver a tus datos reales. */
export function TestBar({ date }: { date: ISODate }) {
  return (
    <div className="test-bar" role="region" aria-label="Modo prueba">
      <button type="button" className="icon-btn" aria-label="Día anterior en la prueba" onClick={() => setTestDate(addDays(date, -1))}>
        <Icon name="chevronLeft" />
      </button>
      <div className="test-txt">
        <b>Modo prueba</b>
        <span>{formatLong(date)}</span>
      </div>
      <button type="button" className="icon-btn" aria-label="Día siguiente en la prueba" onClick={() => setTestDate(addDays(date, 1))}>
        <Icon name="chevronRight" />
      </button>
      <button type="button" className="btn sm" onClick={exitTest}>
        Salir
      </button>
    </div>
  );
}
