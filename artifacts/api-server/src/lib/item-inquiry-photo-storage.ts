import { randomUUID } from "node:crypto";
import { Storage, type File } from "@google-cloud/storage";
import type { Readable } from "node:stream";

const sidecarEndpoint = "http://127.0.0.1:1106";
const maxPhotoBytes = 5 * 1024 * 1024;
const uploadLifetimeMs = 15 * 60 * 1000;
const photoObjectPrefix = "item-inquiry-photos";
const allowedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
] as const);

export type InquiryPhotoContentType =
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export class InquiryPhotoStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InquiryPhotoStorageError";
  }
}

export class InquiryPhotoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InquiryPhotoValidationError";
  }
}

let storageClient: Storage | undefined;

function getStorageClient(): Storage {
  if (!storageClient) {
    storageClient = new Storage({
      credentials: {
        audience: "replit",
        subject_token_type: "access_token",
        token_url: `${sidecarEndpoint}/token`,
        type: "external_account",
        credential_source: {
          url: `${sidecarEndpoint}/credential`,
          format: {
            type: "json",
            subject_token_field_name: "access_token",
          },
        },
        universe_domain: "googleapis.com",
      },
      projectId: "",
    });
  }
  return storageClient;
}

async function createSidecarSignedUploadUrl(
  bucketId: string,
  objectName: string,
): Promise<string> {
  const response = await fetch(
    `${sidecarEndpoint}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketId,
        object_name: objectName,
        method: "PUT",
        expires_at: new Date(Date.now() + uploadLifetimeMs).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new InquiryPhotoStorageError(
      "Could not create a secure inquiry photo upload URL.",
    );
  }

  const result: unknown = await response.json().catch(() => null);
  const signedUrl =
    typeof result === "object" && result !== null && "signed_url" in result
      ? result.signed_url
      : undefined;
  if (typeof signedUrl !== "string") {
    throw new InquiryPhotoStorageError(
      "Could not create a secure inquiry photo upload URL.",
    );
  }

  try {
    if (new URL(signedUrl).protocol !== "https:") {
      throw new Error("Unexpected upload URL protocol.");
    }
  } catch {
    throw new InquiryPhotoStorageError(
      "Could not create a secure inquiry photo upload URL.",
    );
  }
  return signedUrl;
}

function getStorageLocation() {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID?.trim();
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR?.trim();
  if (!bucketId || !privateObjectDir) {
    throw new InquiryPhotoStorageError(
      "Inquiry photo storage is not configured.",
    );
  }

  const parts = privateObjectDir.split("/").filter(Boolean);
  if (parts.length < 1 || parts[0] !== bucketId) {
    throw new InquiryPhotoStorageError(
      "Inquiry photo storage configuration is invalid.",
    );
  }

  return {
    bucketId,
    privatePrefix: parts.slice(1).join("/"),
  };
}

function validateContentType(
  contentType: string,
): InquiryPhotoContentType {
  if (!allowedImageTypes.has(contentType as InquiryPhotoContentType)) {
    throw new InquiryPhotoValidationError(
      "Only JPEG, PNG, and WEBP product photos are accepted.",
    );
  }
  return contentType as InquiryPhotoContentType;
}

function parseInquiryPhotoPath(objectPath: string) {
  const match = /^\/objects\/item-inquiry-photos\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/.exec(
    objectPath,
  );
  if (!match) {
    throw new InquiryPhotoValidationError(
      "Invalid inquiry photo object path.",
    );
  }
  const { bucketId, privatePrefix } = getStorageLocation();
  const relativeName = `${photoObjectPrefix}/${match[1]}`;
  const objectName = [privatePrefix, relativeName].filter(Boolean).join("/");
  return getStorageClient().bucket(bucketId).file(objectName);
}

function matchesImageSignature(
  contentType: InquiryPhotoContentType,
  bytes: Buffer,
) {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/png") {
    return (
      bytes.length >= 8 &&
      bytes.subarray(0, 8).equals(
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      )
    );
  }
  return (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  );
}

async function readFilePrefix(file: File): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of file.createReadStream({ start: 0, end: 11 })) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function validateUploadedPhoto(file: File) {
  const [exists] = await file.exists();
  if (!exists) {
    throw new InquiryPhotoValidationError(
      "The uploaded inquiry photo could not be found.",
    );
  }

  const [metadata] = await file.getMetadata();
  const contentType = validateContentType(String(metadata.contentType ?? ""));
  const size = Number(metadata.size);
  if (!Number.isSafeInteger(size) || size <= 0 || size > maxPhotoBytes) {
    throw new InquiryPhotoValidationError(
      "Inquiry photos must be no larger than 5 MB.",
    );
  }

  const prefix = await readFilePrefix(file);
  if (!matchesImageSignature(contentType, prefix)) {
    throw new InquiryPhotoValidationError(
      "The uploaded file does not match its declared image type.",
    );
  }

  return { contentType, size };
}

export async function createInquiryPhotoUpload(input: {
  contentType: string;
  size: number;
}): Promise<{ uploadUrl: string; objectPath: string }> {
  const contentType = validateContentType(input.contentType);
  if (
    !Number.isSafeInteger(input.size) ||
    input.size <= 0 ||
    input.size > maxPhotoBytes
  ) {
    throw new InquiryPhotoValidationError(
      "Inquiry photos must be no larger than 5 MB.",
    );
  }

  const { bucketId, privatePrefix } = getStorageLocation();
  const objectId = randomUUID();
  const relativeName = `${photoObjectPrefix}/${objectId}`;
  const objectName = [privatePrefix, relativeName].filter(Boolean).join("/");

  try {
    const uploadUrl = await createSidecarSignedUploadUrl(bucketId, objectName);
    return {
      uploadUrl,
      objectPath: `/objects/${relativeName}`,
    };
  } catch {
    throw new InquiryPhotoStorageError(
      "Could not create a secure inquiry photo upload URL.",
    );
  }
}

export async function assertInquiryPhotoUploaded(
  objectPath: string,
): Promise<{ contentType: InquiryPhotoContentType; size: number }> {
  const file = parseInquiryPhotoPath(objectPath);
  try {
    return await validateUploadedPhoto(file);
  } catch (error) {
    if (
      error instanceof InquiryPhotoValidationError ||
      error instanceof InquiryPhotoStorageError
    ) {
      throw error;
    }
    throw new InquiryPhotoStorageError(
      "Could not verify the uploaded inquiry photo.",
    );
  }
}

export async function streamInquiryPhoto(objectPath: string): Promise<{
  stream: Readable;
  contentType: InquiryPhotoContentType;
  contentLength: number;
}> {
  const file = parseInquiryPhotoPath(objectPath);
  const metadata = await assertInquiryPhotoUploaded(objectPath);
  return {
    stream: file.createReadStream(),
    contentType: metadata.contentType,
    contentLength: metadata.size,
  };
}