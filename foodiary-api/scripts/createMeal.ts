/* eslint-disable no-console */
import { promises as fs } from 'fs';
import path from 'path';

const API_URL = 'https://api.danillotorresdev.com.br/meals';
const TOKEN = 'eyJraWQiOiJqeWVsTFoySTJQY25ucFgwVmRsYVdnZjJhRXh1V3ZaUUgzWjZkRHFBZzFZPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiJmNDQ4YjQ1OC1jMDgxLTcwNmMtN2Q2Zi1hM2Q0YjY1ZDk1N2IiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAudXMtZWFzdC0xLmFtYXpvbmF3cy5jb21cL3VzLWVhc3QtMV9BQmx2dTVwRXQiLCJjbGllbnRfaWQiOiJnODUxaTRtbnFyb3QwN3Z0dTlvMDgwamRuIiwib3JpZ2luX2p0aSI6IjAyMjk0ODE4LTMwMWItNDMwMy05ZjA2LTc2ZDY4YTg1ZmJjMyIsImludGVybmFsSWQiOiIzNnNoMVNuSVJQQnhlajl2TnB0Wnlrck1XMEciLCJldmVudF9pZCI6ImVlNjBjOTY1LTJmNDUtNDI0Yi1iZTFhLWEwZmVmZDgyM2FmZiIsInRva2VuX3VzZSI6ImFjY2VzcyIsInNjb3BlIjoiYXdzLmNvZ25pdG8uc2lnbmluLnVzZXIuYWRtaW4iLCJhdXRoX3RpbWUiOjE3NjgxNDAwMjYsImV4cCI6MTc2ODE4MzIyNiwiaWF0IjoxNzY4MTQwMDI2LCJqdGkiOiJlMzI1M2U3Ni0yOWE1LTQyMGQtOGY0ZS0wNmU1ZWRhOGYyNTciLCJ1c2VybmFtZSI6ImY0NDhiNDU4LWMwODEtNzA2Yy03ZDZmLWEzZDRiNjVkOTU3YiJ9.HlsB6Q11Eq0CdjO1_ZxkiVGzCgBVIIc_6RAIh8peCNI_vug4nLztD9zL0EdLDVx-Sskujn9hJ3e3eSoIcn9RUoOXAacHaP2MAgsyE4y6iNvO6fG5qXUqHMK15F-IqyPqEtgIVKa1cyu3E0ULYr4vfnXb4XDk5xZl3DpzD9v2zt3P-5lrUBjEgw8C5XKoz5jStTGpVpxrlkRDzXqTiQXcRmiZyToZUp1dFZeJX006zrUa4D9P6752D9JwxU0Q2mtVT6FMT5Ha_bC9YSJvDvoI1yzqF2nrvyljsQoOYSsY4L1Oq7c0Mwi_iAdsIXXYkBVnAuzVNSRLulsah9MFPK5RKA';

interface IPresignResponse {
  uploadSignature: string;
}

interface IPresignDecoded {
  url: string;
  fields: Record<string, string>;
}

async function readImageFile(filePath: string): Promise<{
  data: Buffer;
  size: number;
  type: string;
}> {
  console.log(`🔍 Reading file from disk: ${filePath}`);
  const data = await fs.readFile(filePath);
  return {
    data,
    size: data.length,
    type: 'image/jpeg',
  };
}

async function createMeal(
  fileType: string,
  fileSize: number,
): Promise<IPresignDecoded> {
  console.log(`🚀 Requesting presigned POST for ${fileSize} bytes of type ${fileType}`);
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ file: { type: fileType, size: fileSize } }),
  });

  if (!res.ok) {
    throw new Error(`Failed to get presigned POST: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as IPresignResponse;
  const decoded = JSON.parse(
    Buffer.from(json.uploadSignature, 'base64').toString('utf-8'),
  ) as IPresignDecoded;

  console.log('✅ Received presigned POST data');
  return decoded;
}

function buildFormData(
  fields: Record<string, string>,
  fileData: Buffer,
  filename: string,
  fileType: string,
): FormData {
  console.log(`📦 Building FormData with ${Object.keys(fields).length} fields and file ${filename}`);
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  const blob = new Blob([fileData], { type: fileType });
  form.append('file', blob, filename);
  return form;
}

async function uploadToS3(url: string, form: FormData): Promise<void> {
  console.log(`📤 Uploading to S3 at ${url}`);
  const res = await fetch(url, {
    method: 'POST',
    body: form,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`S3 upload failed: ${res.status} ${res.statusText} — ${text}`);
  }

  console.log('🎉 Upload completed successfully');
}

async function uploadMealImage(filePath: string): Promise<void> {
  try {
    const { data, size, type } = await readImageFile(filePath);
    const { url, fields } = await createMeal(type, size);
    const form = buildFormData(fields, data, path.basename(filePath), type);
    await uploadToS3(url, form);
  } catch (err) {
    console.error('❌ Error during uploadMealImage:', err);
    throw err;
  }
}

uploadMealImage(
  path.resolve(__dirname, 'assets', 'cover.jpg'),
).catch(() => process.exit(1));
