import crypto from 'crypto';

export interface BookingCodeOptions {
  prefix?: string; // Tiền tố: BK, BOOK, ORD, ...
  length?: number; // Độ dài phần random
  includeDate?: boolean; // Thêm YYMMDD vào mã
  separator?: string; // Ký tự ngăn cách
  alphabet?: string; // Bộ ký tự cho random
}

export function generateBookingCode(options: BookingCodeOptions = {}): string {
  const {
    prefix = 'BK',
    length = 8,
    includeDate = true,
    separator = '-',
    alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', // tránh ký tự dễ nhầm lẫn
  } = options;

  if (length <= 0) throw new Error('length must be > 0');

  // Tạo random string an toàn
  const bytes = crypto.randomBytes(length);
  let randomPart = '';
  for (let i = 0; i < length; i++) {
    randomPart += alphabet[bytes[i] % alphabet.length];
  }

  const parts: string[] = [];

  if (prefix) parts.push(prefix);

  if (includeDate) {
    const d = new Date();
    const yy = d.getFullYear().toString().slice(-2);
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const dd = d.getDate().toString().padStart(2, '0');
    parts.push(`${yy}${mm}${dd}`); // YYMMDD
  }

  parts.push(randomPart);

  return parts.join(separator);
}
