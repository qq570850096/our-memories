import { apiFetch, apiJson } from "@/lib/apiClient";

export type UploadedImage = {
  url: string;
  key: string;
  mimeType: string;
  width: number;
  height: number;
};

type PresignResponse = {
  key: string;
  uploadUrl: string;
  publicUrl: string;
};

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 压缩后硬上限，挡住超大文件

const readBlobAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Image read failed"));
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Image read failed")));
    reader.readAsDataURL(blob);
  });

const loadImageFile = (file: Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const imageUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.addEventListener(
      "load",
      () => {
        URL.revokeObjectURL(imageUrl);
        resolve(image);
      },
      { once: true },
    );
    image.addEventListener(
      "error",
      () => {
        URL.revokeObjectURL(imageUrl);
        reject(new Error("Image load failed"));
      },
      { once: true },
    );
    image.src = imageUrl;
  });

type CompressedImage = { blob: Blob; width: number; height: number; contentType: string };

// 把图片压成 JPEG（svg 直接透传），返回 blob + 尺寸 + contentType。
async function compressImage(file: File): Promise<CompressedImage> {
  if (file.type === "image/svg+xml") {
    return { blob: file, width: 0, height: 0, contentType: file.type };
  }

  const image = await loadImageFile(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return { blob: file, width, height, contentType: file.type || "image/jpeg" };

  context.fillStyle = "#FAFBF7";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
  });

  if (!blob) return { blob: file, width, height, contentType: file.type || "image/jpeg" };
  return { blob, width, height, contentType: "image/jpeg" };
}

/**
 * 统一图片上传：压缩 → 向后端取预签名 PUT URL → 直传 OSS。
 * 当对象存储未配置或直传失败时，回退为 base64 data URL（由后端旧路径接收），保证功能不中断。
 * 回退时 key 为空字符串。
 */
export async function uploadImage(file: File, folder: string): Promise<UploadedImage> {
  const { blob, width, height, contentType } = await compressImage(file);

  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error("图片过大，请压缩后再上传");
  }

  try {
    const presign = await apiJson<PresignResponse>("/api/v1/upload/presign", {
      method: "POST",
      body: JSON.stringify({ folder, contentType }),
    });

    const put = await fetch(presign.uploadUrl, {
      method: "PUT",
      body: blob,
      headers: { "Content-Type": contentType },
    });
    if (!put.ok) throw new Error(`OSS upload failed (${put.status})`);

    return { url: presign.publicUrl, key: presign.key, mimeType: contentType, width, height };
  } catch (error) {
    console.warn("Direct image upload failed; falling back to base64 payload.", error);
    // 回退：对象存储未配置 / 直传失败 → 用 base64 data URL，由后端转存或原样保存。
    const dataUrl = await readBlobAsDataUrl(blob);
    return { url: dataUrl, key: "", mimeType: contentType, width, height };
  }
}

/** 批量上传，保留顺序。 */
export function uploadImages(files: File[], folder: string): Promise<UploadedImage[]> {
  return Promise.all(files.map((file) => uploadImage(file, folder)));
}

/** 保存失败时回滚：删除已直传的对象（base64 回退无 key，自动跳过）。 */
export async function deleteUploaded(keys: string[]): Promise<void> {
  await Promise.all(
    keys
      .filter(Boolean)
      .map((key) =>
        apiFetch(`/api/v1/upload?key=${encodeURIComponent(key)}`, { method: "DELETE" }).catch(() => null),
      ),
  );
}
