export const invalidSaudiPhoneMessage = "أدخل رقم جوال سعودي صحيحاً، مثل 0551234567 أو 966551234567.";

export function normalizeSaudiMobile(value: string) {
  const westernDigits = value.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
  let digits = westernDigits.replace(/\D/g, "");
  if (digits.startsWith("00966")) digits = digits.slice(2);
  const local = digits.startsWith("966")
    ? `0${digits.slice(3)}`
    : digits.startsWith("5")
      ? `0${digits}`
      : digits;
  if (!/^05\d{8}$/.test(local)) return null;
  return { local, international: `966${local.slice(1)}` };
}

export function buildWhatsAppChatUrl(value: string) {
  const phone = normalizeSaudiMobile(value);
  return phone ? `https://wa.me/${phone.international}` : null;
}

export function buildWhatsAppMessageUrl(value: string, message: string) {
  const chatUrl = buildWhatsAppChatUrl(value);
  return chatUrl ? `${chatUrl}?text=${encodeURIComponent(message)}` : null;
}

export function buildWhatsAppTestUrl(value: string) {
  return buildWhatsAppMessageUrl(value, "مرحباً، هذا اختبار");
}