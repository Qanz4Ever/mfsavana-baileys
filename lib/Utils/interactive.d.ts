import { proto } from '../../WAProto/index.js';
import type { ButtonMessageContent, ButtonSection, ButtonSectionRow, InteractiveButtonItem, InteractiveButtonType, WAMediaUpload, WAMessage } from '../Types/index.js';
export type { ButtonMessageContent, ButtonSection, ButtonSectionRow, InteractiveButtonItem, InteractiveButtonType };
/**
 * Format a single user-friendly button item into proto NativeFlowButton
 */
export declare const formatInteractiveButton: (item: InteractiveButtonItem) => proto.Message.InteractiveMessage.NativeFlowMessage.INativeFlowButton;
/**
 * Build a complete Interactive Button message wrapped in viewOnceMessage
 */
export declare const formatInteractiveButtonMessage: (content: ButtonMessageContent, options?: {
    upload?: any;
}) => Promise<proto.IMessage>;
export interface ListMenuRow {
    title: string;
    id: string;
    description?: string;
    header?: string;
}
export interface ListMenuSection {
    title: string;
    highlight_label?: string;
    rows: ListMenuRow[];
}
export interface ListMenuContent {
    title?: string;
    subtitle?: string;
    body?: string;
    text?: string;
    caption?: string;
    footer?: string;
    buttonText?: string;
    sections: ListMenuSection[];
    image?: WAMediaUpload;
    video?: WAMediaUpload;
    document?: WAMediaUpload;
    fileName?: string;
    mimetype?: string;
    jpegThumbnail?: Buffer;
    contextInfo?: proto.IContextInfo;
    mentions?: string[];
    quoted?: WAMessage;
}
/**
 * Build a structured interactive List Menu (single_select) message
 */
export declare const formatListMenuMessage: (content: ListMenuContent, options?: {
    upload?: any;
}) => Promise<proto.IMessage>;
//# sourceMappingURL=interactive.d.ts.map