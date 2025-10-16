import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { isAuthenticated, requireRole } from '../middleware/auth.js';
import { deleteAsset, listAssets, uploadAsset } from '../controllers/assetController.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = path.join(__dirname, '../../uploads/assets');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const category = req.body.category || 'token';
    const categoryDir = path.join(uploadDir, category);
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true });
    }
    cb(null, categoryDir);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${file.originalname}`;
    cb(null, unique);
  }
});

const upload = multer({ storage });

router.get('/', isAuthenticated, requireRole('MJ'), listAssets);
router.post('/upload', isAuthenticated, requireRole('MJ'), upload.single('asset'), uploadAsset);
router.delete('/:id', isAuthenticated, requireRole('MJ'), deleteAsset);

export default router;
