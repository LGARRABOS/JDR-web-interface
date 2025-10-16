import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { requireRole, isAuthenticated } from '../middleware/auth.js';
import { deleteMap, listMaps, uploadMap } from '../controllers/mapController.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, '../../uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${file.originalname}`;
    cb(null, unique);
  }
});

const upload = multer({ storage });

router.get('/', isAuthenticated, requireRole('MJ'), listMaps);
router.post('/upload', isAuthenticated, requireRole('MJ'), upload.single('map'), uploadMap);
router.delete('/:id', isAuthenticated, requireRole('MJ'), deleteMap);

export default router;
