import { requireEntitledUserId } from "@/lib/billing";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  context: { params: Promise<{ qid: string; index: string }> },
) {
  try {
    await requireEntitledUserId();
  } catch {
    return new Response("Subscription required", { status: 403 });
  }

  const { qid: rawQid, index: rawIndex } = await context.params;
  const qid = Number(rawQid);
  const imageIndex = Number(rawIndex);
  if (!Number.isInteger(qid) || qid < 1 || !Number.isInteger(imageIndex) || imageIndex < 1) {
    return new Response("Invalid image identifier", { status: 400 });
  }

  const supabase = await createClient();
  const { data: image, error: imageError } = await supabase
    .from("qbank_question_images")
    .select("storage_path")
    .eq("qid", qid)
    .eq("image_index", imageIndex)
    .maybeSingle();
  if (imageError) return new Response("Could not read image metadata", { status: 502 });
  if (!image) return new Response("Image not found", { status: 404 });

  const { data, error } = await supabase.storage
    .from("qbank-images")
    .createSignedUrl(image.storage_path, 60);
  if (error || !data?.signedUrl) {
    return new Response("Could not create a private image URL", { status: 502 });
  }

  return Response.redirect(data.signedUrl, 307);
}
