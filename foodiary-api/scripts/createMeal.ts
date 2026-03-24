/* eslint-disable no-console */
import { promises as fs } from 'fs';
import path from 'path';

const API_URL = 'https://api.danillotorresdev.com.br/meals';
const TOKEN = 'eyJraWQiOiJqeWVsTFoySTJQY25ucFgwVmRsYVdnZjJhRXh1V3ZaUUgzWjZkRHFBZzFZPSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiI4NDA4NzQ0OC1kMDQxLTcwYmMtYjlhZi0wZTdjMGE3ZjBlNjIiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAudXMtZWFzdC0xLmFtYXpvbmF3cy5jb21cL3VzLWVhc3QtMV9BQmx2dTVwRXQiLCJjbGllbnRfaWQiOiJnODUxaTRtbnFyb3QwN3Z0dTlvMDgwamRuIiwib3JpZ2luX2p0aSI6IjJiYWFlMjlmLTAzNzQtNDk0NS1iNGZhLWExZWM3M2FmZjNlMCIsImludGVybmFsSWQiOiIzODgwTFZObXlaNGJFZHN4WEZQR1Vxd0pVNkwiLCJldmVudF9pZCI6IjU4NmMzY2U0LTkxMDYtNGJhZi05Njk4LTlkYzc3MDY5M2M3NSIsInRva2VuX3VzZSI6ImFjY2VzcyIsInNjb3BlIjoiYXdzLmNvZ25pdG8uc2lnbmluLnVzZXIuYWRtaW4iLCJhdXRoX3RpbWUiOjE3NzQzNzUyOTgsImV4cCI6MTc3NDQxODQ5OCwiaWF0IjoxNzc0Mzc1Mjk4LCJqdGkiOiI5ZmJkYTkwMy0yOTNhLTRmODEtYTQ5Ny1mNzRhN2NkNDUxNTkiLCJ1c2VybmFtZSI6Ijg0MDg3NDQ4LWQwNDEtNzBiYy1iOWFmLTBlN2MwYTdmMGU2MiJ9.siEXj2amwSfFKfgkOVQdvmbyjlS8ahn-YYiBKv8WbDy5PMenZRd6IpUxL9FLEosYZ1cYd0LOLy_Of-dfOmGGSrRiah79_hXznZ5wJpwqXvIzkV_huDCN2A9QDN_DVrqgewBkdHlxcYishYg9UGFws2uh-zoYg75sbMHJl8fDKLGzxr5UBtgEnNlsWoQPyxi_-CpmzcylsHSAOYc6L2ZUcRr_VrDw1mejAs4AjjQMZ6O7G9-_J5R_rRspanZrjS674uBQUeHyy-my9Iq7tg3pUhdcDdjxGh6fRANRNJCfpgYTnThKQC-j_g44Cdvqxijngi16tM8wkfupx-wYoqhlww';

interface IPresignResponse {
  uploadSignature: string;
}

interface IPresignDecoded {
  url: string;
  fields: Record<string, string>;
}

async function readFile(filePath: string, type: 'audio/m4a' | 'image/jpeg'): Promise<{
  data: Buffer;
  size: number;
  type: string;
}> {
  console.log(`🔍 Reading file from disk: ${filePath}`);
  const data = await fs.readFile(filePath);
  return {
    data,
    size: data.length,
    type,
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

async function uploadFile(filePath: string, fileType: 'audio/m4a' | 'image/jpeg'): Promise<void> {
  try {
    const { data, size, type } = await readFile(filePath, fileType);
    const { url, fields } = await createMeal(type, size);
    const form = buildFormData(fields, data, path.basename(filePath), type);
    await uploadToS3(url, form);
  } catch (err) {
    console.error('❌ Error during uploadFile:', err);
    throw err;
  }
}

uploadFile(
  path.resolve(__dirname, 'assets', 'refeicao.jpg'),
  'image/jpeg',
).catch(() => process.exit(1));
