import { AlertTriangleIcon } from './AuthIcons';

interface AuthErrorAlertProps {
  message: string;
}

export function AuthErrorAlert({ message }: AuthErrorAlertProps): React.JSX.Element {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-3"
    >
      <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <p className="text-sm leading-snug text-destructive">{message}</p>
    </div>
  );
}
