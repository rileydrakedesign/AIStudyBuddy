import { Request, Response } from 'express';
import dotenv from 'dotenv';

import {
  S3Client,
  GetObjectCommand,
  GetObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

dotenv.config();

const bucketName = process.env.AWS_S3_BUCKET_NAME!;
const region = process.env.AWS_REGION!;
const accessKeyId = process.env.AWS_ACCESS_KEY!;
const secretAccessKey = process.env.AWS_SECRET!;

const s3Client = new S3Client({
  region,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

export const downloadFile = async (req: Request, res: Response) => {
  try {
    const s3Key = req.query.s3_key as string;

    if (!s3Key) {
      return res.status(400).json({ message: 's3_key query parameter is required' });
    }

    const params: GetObjectCommandInput = {
      Bucket: bucketName,
      Key: s3Key,
      ResponseContentDisposition: 'inline',
      ResponseContentType: 'application/pdf',
    };

    const command = new GetObjectCommand(params);
    const expiresIn = 60; // URL valid for 60 seconds

    // Generate a pre-signed URL
    const url = await getSignedUrl(s3Client, command, { expiresIn });

    // Redirect the client to the pre-signed URL
    return res.redirect(url);
  } catch (error: any) {
    (req as any).log.error(
      { err: error, s3Key: req.query.s3_key },
      "Error generating pre-signed URL"
    );
    return res
      .status(500)
      .json({ message: "Error generating download link", error: error.message });
  }
};
