export type Attachment = {
    type: 'image' | 'text' | 'code' | 'markdown' | 'json' | 'pdf';
    name: string;
    content: string; // base64 for images/pdf, text for others
    mimeType: string;
    persistent?: boolean;      // true = store in projectDocuments, false/undefined = ephemeral
    documentId?: string;       // UUID if already stored in projectDocuments
    contentHash?: string;      // SHA-256 hash for deduplication
}
