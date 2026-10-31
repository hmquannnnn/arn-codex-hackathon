import type { BasketOption, KitPlan } from '@/contract/types';
import { money } from './store';
const viTags: Record<string, string> = {
  'anti-hunchback': 'chống gù',
  lightweight: 'nhẹ',
  waterproof: 'chống nước',
  'backpack-cover': 'che balo',
  'anti-blue-light': 'chống ánh sáng xanh',
};
export function noMatchText(
  plan: KitPlan,
  gap: BasketOption['noMatch'][number],
) {
  const item = plan.items.find((i) => i.key === gap.itemKey);
  const tags = item?.mustHaveTags || [];
  if (plan.language === 'vi') {
    const label = item?.category === 'school-backpack' ? 'balo' : gap.needLabel;
    return `Chưa có ${label}${tags.length ? ' ' + tags.map((t) => viTags[t] || t).join(', ') : ''}${item?.maxUnitPrice ? ' dưới ' + money(item.maxUnitPrice) : ''}${gap.reason === 'none_in_time' ? ' giao kịp hạn' : ''}`;
  }
  return `No exact match: no ${tags.join(' ')} ${item?.category === 'school-backpack' ? 'backpack' : gap.needLabel}${item?.maxUnitPrice ? ' under ' + money(item.maxUnitPrice) : ''}${gap.reason === 'none_in_time' ? ' arriving in time' : ''}`.replace(
    / +/g,
    ' ',
  );
}
export function relativeDate(date: string, today: string) {
  const days = Math.max(
    0,
    Math.floor((Date.parse(today) - Date.parse(date.slice(0, 10))) / 86400000),
  );
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
}
