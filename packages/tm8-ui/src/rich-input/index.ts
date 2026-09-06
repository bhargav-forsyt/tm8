/**
 * rich-input — the shared input primitive for every surface that reaches
 * agent context.
 *
 * The stylesheets are imported HERE, not in `main.tsx`, so this surface is
 * self-contained: mounting any of it from anywhere styles it. Precedent:
 * `files/index.ts`, `panels/index.ts`, `auth/index.ts`.
 */
import '../styles/tokens.css';
import './rich-input.css';

export {
  activeTrigger,
  commitTrigger,
  rankTriggerOptions,
  type ActiveTrigger,
  type RankedTriggerOption,
  type TriggerOption,
  type TriggerRange,
} from './triggers';
export {
  dataTransferHasFiles,
  extractImageFiles,
  extractReadableFiles,
  type ExtractedFiles,
  type ExtractFilesOptions,
} from './clipboardFiles';
export { fileReference, spliceInto } from './caretInsert';
export {
  loadSkillTriggerOptions,
  skillReference,
  type SkillTriggerOption,
} from './skills';
export {
  useRichInput,
  type RichInput,
  type RichInputAreaProps,
  type RichInputAttachments,
  type RichInputAttachmentsSpec,
  type RichInputPlacement,
  type RichInputPopover,
  type RichInputTriggerSpec,
  type StagedAttachment,
} from './useRichInput';
export {
  TriggerPopover,
  highlightMatch,
  popoverWindow,
  MAX_POPOVER_ROWS,
} from './TriggerPopover';
export { AttachmentChips } from './AttachmentChips';
export { ComposerCard } from './ComposerCard';
export { ProseField } from './ProseField';
