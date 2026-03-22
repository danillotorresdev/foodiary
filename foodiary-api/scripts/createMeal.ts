/* eslint-disable no-console */
import { promises as fs } from 'fs';
import path from 'path';

const API_URL = 'https://api.danillotorresdev.com.br/meals';
const TOKEN = 'eyJraWQiOiJqeWVsTFoySTJQY25ucFgwVmRsYVdnZjJhRXh1V3ZaUUgzWjZkRHFBZzFZPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiI4NDA4NzQ0OC1kMDQxLTcwYmMtYjlhZi0wZTdjMGE3ZjBlNjIiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAudXMtZWFzdC0xLmFtYXpvbmF3cy5jb21cL3VzLWVhc3QtMV9BQmx2dTVwRXQiLCJjbGllbnRfaWQiOiJnODUxaTRtbnFyb3QwN3Z0dTlvMDgwamRuIiwib3JpZ2luX2p0aSI6IjI2MTJlYzI5LTdjYTYtNGNiMC04OTI2LWZiZTZkN2M3OGUyYSIsImludGVybmFsSWQiOiIzODgwTFZObXlaNGJFZHN4WEZQR1Vxd0pVNkwiLCJldmVudF9pZCI6ImVhY2RiMDMwLTc1YjYtNDg4Yy04ZDkwLTRkODc5MWM1YWNiOSIsInRva2VuX3VzZSI6ImFjY2VzcyIsInNjb3BlIjoiYXdzLmNvZ25pdG8uc2lnbmluLnVzZXIuYWRtaW4iLCJhdXRoX3RpbWUiOjE3NzQxOTU4MzcsImV4cCI6MTc3NDIzOTAzNywiaWF0IjoxNzc0MTk1ODM3LCJqdGkiOiJiMzc5MGYwOC1mMzZjLTQwN2ItOGI5My1jMTdmZTRlOGMzOWMiLCJ1c2VybmFtZSI6Ijg0MDg3NDQ4LWQwNDEtNzBiYy1iOWFmLTBlN2MwYTdmMGU2MiJ9.vVquXO0wyiyUo2MxlkAqLZsvbOu0xLzwd7YvOG0rii6iZ-MkxzgpOq3wQgkLZCFsXIxLw6DKdv9XLE8nChluEgX5q1hdp7dBmlmEepUHiXFSvjMFuwftzOzVM-0cbPjjvOF3gfE1U-MDZS7xTn6eQrueOWstg3kiXyxSwL9L7bC0RLfwnVmZw5BVJnEV0Is6UvBtVVa0Vua-D_rsPM0mM8u9lRLbjAOANcRlfCBYQyspUniou1XU-WOS795raycYYP33yH066ZDmRMge5nKRQwFllvhcAbXkNRqwz_IrgFR3rY-mP8vVGYPhodekCSBj42SiIpydzXlA_SagW02weA';

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
