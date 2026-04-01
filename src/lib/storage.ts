import { createClient } from "./supabase/server";

type UploadParams = {
  fileBuffer: Buffer;
  fileName: string;
  folder?: string;
  bucket?: string;
  contentType?: string;
  upsert?: boolean;
};

type UploadResult = {
  url: string;
  path: string;
};

/**
 * Minimal Supabase storage helper for server routes.
 */
export async function uploadFileToStorage({
  fileBuffer,
  fileName,
  folder = "",
  bucket = "documents",
  contentType,
  upsert = true,
}: UploadParams): Promise<UploadResult> {
  const supabase = await createClient();

  const cleanFolder = folder.replace(/^\/+|\/+$/g, "");
  const path = cleanFolder ? `${cleanFolder}/${fileName}` : fileName;

  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, fileBuffer, { contentType, upsert });

  if (error) {
    throw new Error(error.message);
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(path);

  return {
    url: publicUrlData.publicUrl,
    path,
  };
}
