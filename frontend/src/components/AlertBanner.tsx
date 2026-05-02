import { TriangleAlert, Sun } from 'lucide-react';
import { useStore } from '../store/appStore';
import { useLang } from '../i18n/LangContext';

export function AlertBanner() {
  const { t } = useLang();
  const alerts = useStore((s) => s.alerts);
  const avg = useStore((s) => s.averageTempC);
  const top = alerts[0];

  if (!top) {
    if (avg && avg > 32) {
      return (
        <div className="alert-banner yellow" role="status">
          <Sun size={18} strokeWidth={2} />
          <div>
            <strong>{t.hotDayIn} · {avg}°C {t.hotDayAvg}</strong>{' '}
            {t.hotDayTip}
          </div>
        </div>
      );
    }
    return null;
  }

  return (
    <div className={`alert-banner ${top.severity}`} role="alert">
      <TriangleAlert size={18} strokeWidth={2} />
      <div>
        <strong>{top.title}</strong> — {top.description}
      </div>
    </div>
  );
}
