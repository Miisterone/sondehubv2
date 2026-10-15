import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Icon3D, type Icon3DId } from './Icon3D';

export function RowSkeleton() {
  return (
    <li className="flex items-start gap-3 border-b px-5 py-4">
      <Skeleton className="bg-surface size-8 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="bg-surface h-4 w-28 rounded-sm" />
        <Skeleton className="bg-surface h-3.5 w-52 rounded-sm" />
        <div className="grid grid-cols-3 gap-3 pt-1.5">
          <Skeleton className="bg-surface h-8 rounded-sm" />
          <Skeleton className="bg-surface h-8 rounded-sm" />
          <Skeleton className="bg-surface h-8 rounded-sm" />
        </div>
      </div>
    </li>
  );
}

export function EmptyState({
  icon,
  art,
  title,
  children,
  actions,
}: {
  icon?: ReactNode;
  art?: Icon3DId;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start px-5 py-8">
      {art ? (
        <Icon3D id={art} size={96} className="-mt-3 mb-2 -ml-2.5" />
      ) : (
        <span className="text-muted-foreground mb-4 grid size-10 place-items-center rounded-md border [&>svg]:size-5">{icon}</span>
      )}
      <h2 className="text-[16px] font-semibold">{title}</h2>
      {children && <p className="mt-1 max-w-80 text-[13.5px] leading-relaxed">{children}</p>}
      {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
