const DEFAULT_MAX_DIMENSION = 800;
const DEFAULT_QUALITY = 0.75;

interface CompressImageOptions {
  maxDimension?: number;
  quality?: number;
}

function supportsWebpEncoding(canvas: HTMLCanvasElement): boolean {
  return canvas.toDataURL("image/webp").startsWith("data:image/webp");
}

async function drawResizedCanvas(file: Blob, maxDimension: number): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("캔버스 컨텍스트를 생성할 수 없습니다.");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas;
  } finally {
    bitmap.close();
  }
}

/**
 * 업로드된 이미지를 캔버스로 리사이즈·재인코딩해 용량을 크게 줄인다.
 * 4~5MB 원본도 가로 최대 800px + WebP(미지원 시 JPEG) 품질 0.75로 축소하면
 * 대체로 100KB 이하가 되어 localStorage에 데이터 URL로 저장해도 용량 초과가 나지 않는다.
 */
export async function compressImageToDataUrl(
  file: Blob,
  options: CompressImageOptions = {}
): Promise<string> {
  const { maxDimension = DEFAULT_MAX_DIMENSION, quality = DEFAULT_QUALITY } = options;
  const canvas = await drawResizedCanvas(file, maxDimension);
  const mimeType = supportsWebpEncoding(canvas) ? "image/webp" : "image/jpeg";
  return canvas.toDataURL(mimeType, quality);
}

/**
 * 캐릭터 프로필 이미지(원본 화질 data URL — CharacterModal은 압축 없이 저장한다)를
 * Gemini 참조 이미지로 보내기 전에 축소한다. 외형 참고용이라 원본 화질이 필요 없고,
 * 작을수록 요청이 가볍고 빠르다.
 */
export async function compressDataUrlForReference(dataUrl: string): Promise<string | null> {
  if (!dataUrl) return null;
  try {
    const blob = await fetch(dataUrl).then((res) => res.blob());
    return await compressImageToDataUrl(blob, { maxDimension: 512, quality: 0.8 });
  } catch {
    return null;
  }
}

/** Gemini API가 돌려주는 base64 인라인 이미지 데이터를 업로드 가능한 File로 바꾼다. */
export function base64ToFile(base64: string, mimeType: string, fileName: string): File {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNumbers[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new File([byteArray], fileName, { type: mimeType });
}

/**
 * compressImageToDataUrl과 같은 리사이즈·재인코딩 결과를 Blob으로 돌려준다.
 * 4K 원본과 함께 서버에 업로드할 800px 경량 썸네일을 만들 때 사용한다.
 */
export async function createThumbnailBlob(
  file: Blob,
  options: CompressImageOptions = {}
): Promise<Blob> {
  const { maxDimension = DEFAULT_MAX_DIMENSION, quality = DEFAULT_QUALITY } = options;
  const canvas = await drawResizedCanvas(file, maxDimension);
  const mimeType = supportsWebpEncoding(canvas) ? "image/webp" : "image/jpeg";
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("썸네일 생성에 실패했습니다."))),
      mimeType,
      quality
    );
  });
}
