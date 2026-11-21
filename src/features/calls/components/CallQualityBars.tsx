import { useTranslation } from 'react-i18next';
import { qualityTone, type QualityBars } from '../lib/call-stats';

export function CallQualityBars({ bars, relayed = null }: { bars: QualityBars | null; relayed?: boolean | null }) {
  const { t } = useTranslation();
  if (bars === null) {
    return null;
  }
  const tone = qualityTone(bars, relayed);
  const route = relayed === null ? '' : relayed ? t('calls.route.relay') : t('calls.route.direct');
  const label = route ? `${t('calls.quality', { bars })} · ${route}` : t('calls.quality', { bars });
  return (
    <span role="img" aria-label={label} title={label} data-tone={tone} className="sc-call-quality">
      {[1, 2, 3].map((level) => (
        <span key={level} className="sc-call-quality-bar" data-on={level <= bars} style={{ height: `${level * 4 + 4}px` }} />
      ))}
    </span>
  );
}
