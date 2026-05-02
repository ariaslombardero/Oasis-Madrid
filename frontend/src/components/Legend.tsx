import { useLang } from '../i18n/LangContext';

export function Legend() {
  const { t } = useLang();
  return (
    <div className="legend" aria-label="Leyenda">
      <div className="legend-title">{t.thermalRisk}</div>
      <div className="legend-row"><span className="swatch" style={{ background: '#3B8C52' }} /> {t.legendLabels.comfort}</div>
      <div className="legend-row"><span className="swatch" style={{ background: '#D4920A' }} /> {t.legendLabels.mild}</div>
      <div className="legend-row"><span className="swatch" style={{ background: '#D95F32' }} /> {t.legendLabels.moderate}</div>
      <div className="legend-row"><span className="swatch" style={{ background: '#C42B2B' }} /> {t.legendLabels.high}</div>
      <div className="legend-row"><span className="swatch" style={{ background: '#7B0D4A' }} /> {t.legendLabels.extreme}</div>
      <div className="legend-title" style={{ marginTop: 8 }}>{t.legendIcons}</div>
      <div className="legend-row"><span className="swatch" style={{ background: '#2271B3' }} /> {t.drinkFountainLegend}</div>
      <div className="legend-row"><span className="swatch" style={{ background: '#4A9B5E' }} /> {t.petFountainLegend}</div>
    </div>
  );
}
