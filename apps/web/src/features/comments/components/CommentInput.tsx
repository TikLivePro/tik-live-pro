'use client';

import {
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { useTranslations } from 'next-intl';
import { AttachmentPreview } from './AttachmentPreview';
import { EmojiPickerPopover } from './EmojiPickerPopover';
import { GifPickerPopover } from './GifPickerPopover';
import { LinkInsertPopover } from './LinkInsertPopover';
import { LinkPreviewCard } from './LinkPreviewCard';
import { LinkPreviewSquare } from './LinkPreviewSquare';
import { useLinkPreview } from '../hooks/useLinkPreview';

interface CommentInputProps {
  placeholder: string;
  disabled?: boolean;
  isSending?: boolean;
  onSend: (text: string, mediaUrls?: string[]) => Promise<void> | void;
}

interface Attachment {
  url: string;
  name?: string | undefined;
}

function PaperclipIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}

export function CommentInput({ placeholder, disabled, isSending, onSend }: CommentInputProps) {
  const t = useTranslations('comments');
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { items: linkPreviews } = useLinkPreview(text, !disabled && !isSending);

  const isDisabled = disabled || isSending;
  const canSend = (text.trim().length > 0 || attachments.length > 0) && !isDisabled;

  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  };

  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    autoResize();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const readFileAsDataUrl = (file: File): Promise<Attachment> =>
    new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve({ url: ev.target?.result as string, name: file.name });
      reader.readAsDataURL(file);
    });

  const addFiles = async (files: File[]) => {
    const loaded = await Promise.all(files.map(readFileAsDataUrl));
    setAttachments((prev) => [...prev, ...loaded]);
  };

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = Array.from(e.clipboardData.files).filter((f) =>
      f.type.startsWith('image/'),
    );
    if (imageFiles.length > 0) {
      e.preventDefault();
      void addFiles(imageFiles);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) void addFiles(files);
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEmojiSelect = (emoji: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const newText = text.slice(0, start) + emoji + text.slice(end);
    setText(newText);
    setTimeout(() => {
      if (el) {
        el.selectionStart = el.selectionEnd = start + emoji.length;
        el.focus();
        autoResize();
      }
    }, 0);
  };

  const handleGifSelect = (gifUrl: string) => {
    setAttachments((prev) => [...prev, { url: gifUrl, name: 'GIF' }]);
    textareaRef.current?.focus();
  };

  const handleLinkInsert = (url: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? text.length;
    const before = text.slice(0, start);
    const after = text.slice(start);
    const space = before.length > 0 && !before.endsWith(' ') ? ' ' : '';
    const newText = before + space + url + ' ' + after;
    setText(newText);
    setTimeout(() => {
      if (el) {
        const pos = before.length + space.length + url.length + 1;
        el.selectionStart = el.selectionEnd = pos;
        el.focus();
        autoResize();
      }
    }, 0);
  };

  const handleSend = async () => {
    if (!canSend) return;
    const textToSend = text.trim();
    const mediaUrls = attachments.length > 0 ? attachments.map((a) => a.url) : undefined;
    setText('');
    setAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await onSend(textToSend, mediaUrls);
  };

  return (
    <div className="border border-border rounded-xl bg-background overflow-visible transition-shadow focus-within:shadow-[0_0_0_2px_hsl(var(--ring)/0.2)]">
      {/* Attachment previews */}
      {attachments.length > 0 && (
        <div className="flex items-start gap-2 flex-wrap px-3 pt-2.5 pb-0">
          {attachments.map((att, i) => (
            <AttachmentPreview
              key={i}
              url={att.url}
              name={att.name}
              onRemove={() => removeAttachment(i)}
            />
          ))}
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={text}
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder}
        disabled={isDisabled}
        rows={1}
        aria-label={placeholder}
        className="w-full px-3 pt-2.5 pb-1 text-sm bg-transparent resize-none focus:outline-none placeholder:text-muted-foreground disabled:opacity-50 min-h-[40px] max-h-[120px] leading-relaxed"
      />

      {/* Link previews */}
      {linkPreviews.length > 0 && (
        <div className="px-3 pb-2">
          {linkPreviews.length > 1 ? (
            <div className="flex flex-row flex-wrap gap-1.5 pt-1">
              {linkPreviews.map((item) =>
                item.loading || !item.data ? null : (
                  <LinkPreviewSquare key={item.url} preview={item.data} onDismiss={item.dismiss} />
                ),
              )}
            </div>
          ) : linkPreviews[0] ? (
            <LinkPreviewCard
              preview={linkPreviews[0].data ?? { url: linkPreviews[0].url, title: null, description: null, image: null, siteName: null, domain: '' }}
              loading={linkPreviews[0].loading}
              onDismiss={linkPreviews[0].dismiss}
            />
          ) : null}
        </div>
      )}

      {/* Hidden file input — multiple files allowed */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,image/gif,.pdf,.doc,.docx,.txt"
        onChange={handleFileChange}
        className="hidden"
        aria-hidden
      />

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-t border-border">
        <EmojiPickerPopover onSelect={handleEmojiSelect} disabled={isDisabled} />
        <GifPickerPopover onSelect={handleGifSelect} disabled={isDisabled} />
        <button
          type="button"
          disabled={isDisabled}
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
          title="Attach files"
          aria-label="Attach files or images"
        >
          <PaperclipIcon />
        </button>
        <LinkInsertPopover onInsert={handleLinkInsert} disabled={isDisabled} />

        <div className="flex-1" />

        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!canSend}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label={isSending ? t('sending') : t('send')}
        >
          <span>{isSending ? t('sending') : t('send')}</span>
          {!isSending && <SendIcon />}
        </button>
      </div>
    </div>
  );
}
