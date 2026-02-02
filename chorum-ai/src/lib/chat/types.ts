export type Attachment = {
    type: 'image' | 'text' | 'code' | 'markdown' | 'json' | 'pdf';
    name: string;
    content: string; // base64 for images/pdf, text for others
    mimeType: string;
}
