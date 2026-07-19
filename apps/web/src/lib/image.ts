import type { OutgoingImage } from "./sse";

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

/**
 * Prepara a foto do documento para envio: redimensiona no browser para no
 * máximo 1600px (JPEG) — foto de celular moderna tem 10MB+; para OCR basta
 * uma fração disso. Menos bytes = upload rápido mesmo em 4G.
 */
export async function prepareImageForUpload(file: File): Promise<OutgoingImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível neste navegador");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  const base64 = dataUrl.split(",")[1];
  if (!base64) throw new Error("Falha ao codificar a imagem");
  return { base64, mediaType: "image/jpeg" };
}
