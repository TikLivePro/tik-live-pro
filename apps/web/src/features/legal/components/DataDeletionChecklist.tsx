import { useTranslations } from 'next-intl';
import { DATA_DELETION_CHECKLIST_ITEMS } from '../consts/legal.consts';
import type { DataDeletionChecklistKey } from '../interfaces/legal.interfaces';
import { UserCircleIcon, KeyIcon, HistoryIcon, VideoOffIcon } from './LegalIcons';

const CHECKLIST_ICONS: Record<DataDeletionChecklistKey, (props: { className?: string }) => React.JSX.Element> = {
  account: UserCircleIcon,
  socialTokens: KeyIcon,
  streamHistory: HistoryIcon,
  recordings: VideoOffIcon,
};

/** The "what gets deleted" 4-item icon grid on the Data Deletion page. */
export function DataDeletionChecklist(): React.JSX.Element {
  const t = useTranslations('legal.dataDeletion.checklist');

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {DATA_DELETION_CHECKLIST_ITEMS.map((key) => {
        const Icon = CHECKLIST_ICONS[key];
        return (
          <div key={key} className="flex items-start gap-3 rounded-lg border border-border/60 bg-muted/30 p-3.5">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <div>
              <p className="text-sm font-semibold text-foreground">{t(`${key}.title`)}</p>
              <p className="text-xs text-muted-foreground">{t(`${key}.description`)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
