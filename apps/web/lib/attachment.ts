
export const MAX_ATTACHMENT_COUNT = 4;
export const MAX_EACH_ATTACHMENT_BYTES = 2.5 * 1024 * 1024;
export const MAX_TOTAL_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export type MessageAttachmentLike = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  dataBase64: string;
};

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/");
}

export function formatBytes(bytes: number, decimals = 2): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 Bytes";
  }

  const base = 1024;
  const scale = decimals < 0 ? 0 : decimals;
  const units = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(base)), units.length - 1);

  return `${(bytes / Math.pow(base, exp)).toFixed(scale)} ${units[exp]}`;
}

export function truncateFileName(name: string, maxLength: number): string {
  if (name.length <= maxLength) {
    return name;
  }

  const extension = name.split(".").pop();
  if (!extension || name.length < maxLength) {
    return `${name.slice(0, maxLength - 3)}...`;
  }

  const stem = name.slice(0, name.lastIndexOf("."));
  return `${stem.slice(0, Math.max(8, maxLength - extension.length - 4))}...${extension}`;
}

export function sanitizeMessageAttachments(value: unknown): MessageAttachmentLike[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const maxCount = MAX_ATTACHMENT_COUNT;
  const maxTotal = MAX_TOTAL_ATTACHMENT_BYTES;
  const maxEach = MAX_EACH_ATTACHMENT_BYTES;
  const out: MessageAttachmentLike[] = [];
  let runningTotal = 0;

  for (const item of value) {
    if (out.length >= maxCount) {
      return out;
    }

    if (
      typeof item !== "object" ||
      item === null ||
      typeof item.id !== "string" ||
      typeof item.name !== "string" ||
      typeof item.mimeType !== "string" ||
      typeof item.size !== "number" ||
      !Number.isFinite(item.size) ||
      item.size < 0 ||
      item.size > maxEach ||
      typeof item.dataBase64 !== "string"
    ) {
      continue;
    }

    if (runningTotal + item.size > maxTotal) {
      continue;
    }

    out.push({
      id: item.id,
      name: item.name,
      mimeType: item.mimeType,
      size: item.size,
      dataBase64: item.dataBase64,
    });

    runningTotal += item.size;
  }

  return out;
}

export function formatAttachmentSizeLabel(bytes: number): string {
  return formatBytes(bytes, 1);
}
