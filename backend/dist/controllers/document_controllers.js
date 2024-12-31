import Document from '../models/documents.js';
import User from '../models/user.js';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import multer from 'multer';
import dotenv from 'dotenv';
dotenv.config();
const bucketName = process.env.AWS_S3_BUCKET_NAME;
const region = process.env.AWS_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY;
const secretAccessKey = process.env.AWS_SECRET;
const s3Client = new S3Client({
    region,
    credentials: {
        accessKeyId,
        secretAccessKey,
    },
});
// Define __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// Configure Multer for file uploads (store files in memory)
const upload = multer({ storage: multer.memoryStorage() });
// Function to upload file to S3
async function uploadFileToS3(fileBuffer, fileName, mimetype) {
    const uploadParams = {
        Bucket: bucketName,
        Body: fileBuffer,
        Key: fileName,
        ContentType: mimetype,
        ContentDisposition: 'inline',
    };
    await s3Client.send(new PutObjectCommand(uploadParams));
}
// Function to delete file from S3
async function deleteFileFromS3(fileName) {
    const deleteParams = {
        Bucket: bucketName,
        Key: fileName,
    };
    await s3Client.send(new DeleteObjectCommand(deleteParams));
}
// Function to get pre-signed URL for an object
async function getObjectSignedUrl(key) {
    const params = {
        Bucket: bucketName,
        Key: key,
    };
    const command = new GetObjectCommand(params);
    const seconds = 60; // URL expires in 60 seconds
    const url = await getSignedUrl(s3Client, command, { expiresIn: seconds });
    return url;
}
// Export the Multer upload middleware
export const uploadMiddleware = upload.array('files', 5);
export const uploadDocument = async (req, res, next) => {
    try {
        const currentUser = await User.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res
                .status(401)
                .json({ message: 'User not registered or token malfunctioned' });
        }
        const userId = currentUser._id.toString();
        const files = req.files;
        const className = req.body.className || 'General';
        if (!files || files.length === 0) {
            return res.status(400).json({ message: 'No file uploaded' });
        }
        // Ensure the class is added if it doesn't exist
        const classExists = currentUser.classes.some(cls => cls.name === className);
        if (!classExists) {
            currentUser.classes.push({ name: className });
            await currentUser.save();
            console.log(`Added class '${className}' to user ${userId}`);
        }
        const uploadedDocs = [];
        let completedCount = 0;
        // For each file in the array, run the EXACT logic but use file.key & file.location
        for (const file of files) {
            if (!file) {
                console.log('A file was missing, skipping...');
                completedCount++;
                continue;
            }
            console.log('File details:', {
                originalname: file.originalname,
                mimetype: file.mimetype,
            });
            // 1) Let’s rely on multer-s3's automatically generated key + location:
            //    file.key => S3 key
            //    file.location => S3 URL
            const s3Key = file.key; // from multer-s3
            const s3Url = file.location; // from multer-s3
            // (Optional fallback if these are undefined)
            if (!s3Key || !s3Url) {
                console.warn('file.key or file.location missing, using fallback keys/URLs.');
            }
            console.log('S3 key from multer-s3:', s3Key);
            console.log('S3 URL:', s3Url);
            // 2) Create document record in Mongo
            const newDocument = new Document({
                userId: userId,
                fileName: file.originalname,
                uploadedAt: Date.now(),
                s3Key: s3Key || `fallbackKey-${file.originalname}`,
                s3Url: s3Url || `https://...fallbackUrl.../${file.originalname}`,
                className: className,
            });
            await newDocument.save();
            console.log('stored file meta in mongodb');
            // 3) Python script call (unchanged)
            const pythonPath = process.env.PYTHON_PATH || 'python';
            const scriptPath = '/Users/rileydrake/Desktop/AIStudyBuddy/backend/python_scripts/load_data.py';
            console.log('Executing Python script:', { pythonPath, scriptPath });
            const options = {
                env: {
                    ...process.env,
                    MONGO_CONNECTION_STRING: process.env.MONGO_CONNECTION_STRING,
                    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY,
                    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET,
                    AWS_REGION: process.env.AWS_REGION,
                    AWS_S3_BUCKET_NAME: process.env.AWS_S3_BUCKET_NAME,
                    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
                },
            };
            execFile(pythonPath, [
                scriptPath,
                '--user_id',
                userId,
                '--class_name',
                className,
                '--s3_key',
                s3Key || '',
                '--doc_id',
                newDocument._id.toString(),
            ], options, async (error, stdout, stderr) => {
                if (error) {
                    console.error(`Exec error: ${error}`);
                }
                else {
                    console.log(`Python stdout: ${stdout}`);
                    console.error(`Python stderr: ${stderr}`);
                }
                // 4) Once done with Python for this file
                uploadedDocs.push(newDocument);
                completedCount++;
                if (completedCount === files.length) {
                    // All done, send final success
                    return res.status(200).json({
                        message: 'All files uploaded and processed successfully',
                        documents: uploadedDocs,
                    });
                }
            });
        }
        // No res return here, we respond after the last file's callback
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Server error' });
    }
};
export const getUserDocuments = async (req, res, next) => {
    try {
        const currentUser = await User.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res
                .status(401)
                .json({ message: 'User not registered or token malfunctioned' });
        }
        const documents = await Document.find({ userId: currentUser._id });
        return res.status(200).json({ message: 'OK', documents });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Server error' });
    }
};
export const getDocumentFile = async (req, res, next) => {
    try {
        const currentUser = await User.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res
                .status(401)
                .json({ message: 'User not registered or token malfunctioned' });
        }
        const documentId = req.params.id;
        const document = (await Document.findById(documentId));
        if (!document) {
            return res.status(404).json({ message: 'Document not found' });
        }
        if (document.userId.toString() !== currentUser._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized access' });
        }
        // Generate a pre-signed URL for the S3 object
        const url = await getObjectSignedUrl(document.s3Key);
        return res.status(200).json({ url });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Server error' });
    }
};
export const deleteDocument = async (req, res, next) => {
    try {
        const currentUser = await User.findById(res.locals.jwtData.id);
        if (!currentUser) {
            return res
                .status(401)
                .json({ message: 'User not registered or token malfunctioned' });
        }
        const documentId = req.params.id;
        const document = (await Document.findById(documentId));
        if (!document) {
            return res.status(404).json({ message: 'Document not found' });
        }
        if (document.userId.toString() !== currentUser._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized access' });
        }
        // Delete the file from S3
        await deleteFileFromS3(document.s3Key);
        // Delete the document record from the database
        await Document.deleteOne({ _id: documentId });
        return res.status(200).json({ message: 'Document deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting file from S3:', error);
        return res.status(500).json({ message: 'Error deleting file from S3' });
    }
};
//# sourceMappingURL=document_controllers.js.map