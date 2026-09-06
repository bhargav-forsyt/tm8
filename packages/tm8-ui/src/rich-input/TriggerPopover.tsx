/**
 * THE ONE PICKER — a listbox over the textarea, driven entirely by the hook.
 *
 * A view for hosts that do not already own popover markup (the doc editor,
 * the entity Discussion composer, chat-home). `channel-screen/Composer` keeps
 * its own `chs-*` markup over the same hook state — the shared thing is the
 * BEHAVIOUR, and two stylesheets over one contract is the intended shape, not
 * a fork. The two pieces that must NOT be re-derived per stylesheet —
 * which characters matched, and which rows are on screen — are exported from
 * here (`highlightMatch`, `popoverWindow`) and used by both.
 *
 * The popover has no focusable parts: the textarea drives it, per the hook's
 * keyboard contract. Rows are buttons only so a mouse can commit them; hover
 * moves the highlight so the mouse and the arrow keys never disagree about
 * which row Enter would take.
 *
 * POSITIONING: `.ri-popover` pins itself above the nearest positioned
 * ancestor — the host wraps its textarea in a `position: relative` container
 * (`.ri-host` is provided for exactly this).
 */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { RichInputPopover } from './useRichInput';
import type { RankedTriggerOption } from './triggers';

/**
 * How many rows are BUILT at once. Not a filter — `popover.options` still
 * holds every match, and the window below slides to keep the highlighted row
 * on screen — but a picker that renders a 500-row catalog into the DOM on the
 * first `/` costs a visible frame for rows nobody will ever scroll to.
 */
export const MAX_POPOVER_ROWS = 8;

/**
 * The slice of the ranked list to render: at most `max` rows, ALWAYS
 * containing `activeIndex`. Anchored at the top until the highlight walks
 * past the last visible row, then it follows — so ↓ never lands on a row that
 * does not exist in the DOM, which would leave `aria-activedescendant`
 * pointing at nothing and the listbox silent for a screen reader.
 */
export function popoverWindow(
  total: number,
  activeIndex: number,
  max: number = MAX_POPOVER_ROWS,
): { from: number; to: number } {
  if (total <= max) return { from: 0, to: total };
  const from = Math.min(Math.max(activeIndex - max + 1, 0), total - max);
  return { from, to: from + max };
}

/**
 * `text` with the matched characters wrapped for emphasis — the ONLY honest
 * way to explain a ranked list: a row that reached the list through a fuzzy
 * subsequence looks arbitrary until you can see which letters it matched.
 *
 * Consecutive offsets are collapsed into one element so a whole matched word
 * is one bold run rather than a stutter of per-character tags. An empty
 * `indices` (an alias or description hit — nothing in the name matched)
 * returns the plain text, which is the truth about those rows.
 */
export function highlightMatch(
  text: string,
  indices: readonly number[],
  hitClassName = 'ri-popover__hit',
): ReactNode {
  if (indices.length === 0) return text;
  const wanted = new Set(indices);
  const parts: ReactNode[] = [];
  let at = 0;
  while (at < text.length) {
    const hit = wanted.has(at);
    let end = at + 1;
    while (end < text.length && wanted.has(end) === hit) end += 1;
    const chunk = text.slice(at, end);
    parts.push(hit ? <strong key={at} className={hitClassName}>{chunk}</strong> : chunk);
    at = end;
  }
  return parts;
}

export function TriggerPopover({
  popover,
  label,
  prefix = '',
  renderOption,
  emptyText,
  testId,
}: {
  popover: RichInputPopover | null;
  /** Names the listbox for assistive tech, e.g. "Available skills". */
  label: string;
  /** Drawn before the name, unhighlighted — the sigil the row commits (`/`). */
  prefix?: string;
  /** Row content. Default: prefixed name with the match bolded, then meta and group. */
  renderOption?: (option: RankedTriggerOption) => ReactNode;
  emptyText?: string;
  testId?: string;
}) {
  const listbox = useRef<HTMLDivElement>(null);

  /**
   * Keep the highlighted row inside the scroll port. `scrollIntoView` is
   * optional-called because jsdom does not implement it — the guard keeps
   * the keyboard tests honest instead of stubbing the DOM.
   */
  useEffect(() => {
    if (!popover) return;
    const active = listbox.current?.querySelector('[data-active="true"]');
    (active as HTMLElement | null)?.scrollIntoView?.({ block: 'nearest' });
  }, [popover, popover?.activeIndex]);

  if (!popover) return null;

  const { from, to } = popoverWindow(popover.options.length, popover.activeIndex);

  return (
    <div className="ri-popover" data-testid={testId ?? 'ri-popover'}>
      {popover.query ? (
        <p className="ri-popover__query">{`Matching “${popover.query}”`}</p>
      ) : null}
      <div id={popover.listboxId} ref={listbox} role="listbox" aria-label={label}>
        {popover.options.slice(from, to).map((option, offset) => {
          const index = from + offset;
          return (
            <button
              key={option.id}
              id={popover.optionDomId(option)}
              type="button"
              role="option"
              data-active={index === popover.activeIndex}
              aria-selected={false}
              onMouseEnter={() => popover.setActive(index)}
              onClick={() => popover.select(option)}
            >
              {renderOption ? renderOption(option) : (
                <>
                  <span className="ri-popover__name">
                    {prefix}
                    {highlightMatch(option.display, option.matchIndices)}
                  </span>
                  {option.meta ? <span className="ri-popover__meta">{option.meta}</span> : null}
                  {option.group ? <span className="ri-popover__group">{option.group}</span> : null}
                </>
              )}
            </button>
          );
        })}
      </div>
      {popover.options.length ? null : (
        <p className="ri-popover__empty" role="status">
          {emptyText ?? `No matches for “${popover.sigil}${popover.query}”`}
        </p>
      )}
    </div>
  );
}
