import { t } from '../i18n';
import type { StatsDay } from '../types';
import { formatHours } from './model';

/** Activity calendar: one cell per day, columns are weeks (like GitHub). */
export function Calendar({ days }: { days: StatsDay[] }) {
  return (
    <div className="cal" role="img" aria-label={t().stats.activity}>
      {days.map(d => <i key={d.date} className={`day lv${d.level}`} title={t().stats.dayTitle(d.date, formatHours(d.active_ms))} />)}
    </div>
  );
}
