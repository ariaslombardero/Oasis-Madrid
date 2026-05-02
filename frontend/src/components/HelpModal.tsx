import { X } from 'lucide-react';
import { useLang } from '../i18n/LangContext';

interface Props {
  onClose: () => void;
}

export function HelpModal({ onClose }: Props) {
  const { t } = useLang();

  return (
    <div className="help-overlay" role="dialog" aria-modal="true" aria-label={t.helpTitle} onClick={onClose}>
      <div className="help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="help-header">
          <h2 className="help-title">{t.helpTitle}</h2>
          <button className="help-close" onClick={onClose} aria-label="Cerrar">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="help-steps">
          {t.helpSteps.map((step, i) => (
            <div key={i} className="help-step">
              <div className="help-step-icon" aria-hidden>{step.icon}</div>
              <div className="help-step-body">
                <div className="help-step-title">{step.title}</div>
                <div className="help-step-desc">{step.desc}</div>
              </div>
            </div>
          ))}
        </div>

        <button className="help-cta" onClick={onClose}>
          {t.helpClose}
        </button>
      </div>
    </div>
  );
}
