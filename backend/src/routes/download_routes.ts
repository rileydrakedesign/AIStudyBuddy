import { Router } from 'express';
import { downloadFile } from '../controllers/download_controllers.js'; 
import { verifyToken } from '../utils/token_manager.js';

const downloadRoutes = Router();

downloadRoutes.get('/', verifyToken, downloadFile); 

export default downloadRoutes;
