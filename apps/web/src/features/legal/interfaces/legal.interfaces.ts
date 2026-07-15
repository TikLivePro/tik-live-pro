/** One section of a legal document: TOC entry id/label plus its prose body. */
export interface LegalSection {
  id: string;
  title: string;
  body: string;
}

export type DataDeletionStatus = 'form' | 'confirming' | 'success';

export type DataDeletionReasonValue = 'privacy' | 'switching' | 'quitting' | 'technical' | 'other';

export type DataDeletionChecklistKey = 'account' | 'socialTokens' | 'streamHistory' | 'recordings';
